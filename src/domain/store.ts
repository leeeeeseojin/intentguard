import { CloudError } from "./errors.js";
import { createSeedState, type CloudState } from "./seed.js";
import {
  INSTANCE_QUOTA,
  SPEC_MONTHLY_COST,
  ZONES,
  type Actor,
  type AddRuleInput,
  type AuditEntry,
  type Bucket,
  type CreateInstanceInput,
  type Instance,
  type SecurityGroup,
} from "./types.js";

export interface MiniCloudOptions {
  /** 상태 전이(creating→running 등)에 걸리는 시간. 테스트에서는 0으로 둔다. */
  transitionDelayMs?: number;
  now?: () => Date;
}

const NAME_PATTERN = /^[a-z][a-z0-9-]{2,30}$/;

export class MiniCloud {
  private state: CloudState = createSeedState();
  private audit: AuditEntry[] = [];
  private seq = 0;
  private idCounter = 100;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly delay: number;
  private readonly now: () => Date;

  constructor(options: MiniCloudOptions = {}) {
    this.delay = options.transitionDelayMs ?? 1500;
    this.now = options.now ?? (() => new Date());
  }

  reset() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.state = createSeedState();
    this.audit = [];
    this.seq = 0;
    this.idCounter = 100;
  }

  // ---------- 조회 ----------

  listInstances(filter: { env?: string; status?: string; q?: string } = {}): Instance[] {
    return this.state.instances
      .filter((i) => !filter.env || i.env === filter.env)
      .filter((i) => !filter.status || i.status === filter.status)
      .filter((i) => !filter.q || i.name.includes(filter.q))
      .map((i) => ({ ...i }));
  }

  getInstance(id: string): Instance {
    return { ...this.findInstance(id) };
  }

  listSecurityGroups(): SecurityGroup[] {
    return structuredClone(this.state.securityGroups);
  }

  getSecurityGroup(id: string): SecurityGroup {
    return structuredClone(this.findSecurityGroup(id));
  }

  listBuckets(): Bucket[] {
    return this.state.buckets.map((b) => ({ ...b }));
  }

  getAudit(): AuditEntry[] {
    return [...this.audit];
  }

  // ---------- 서버 ----------

  createInstance(input: CreateInstanceInput, actor: Actor = "unknown"): Instance {
    return this.record(actor, "instance.create", input.name, () => {
      if (!NAME_PATTERN.test(input.name)) {
        throw new CloudError(
          "INVALID_ARGUMENT",
          "서버 이름 형식이 올바르지 않습니다.",
          "영문 소문자로 시작하고 소문자·숫자·하이픈만 사용해 3~31자로 입력하세요.",
        );
      }
      if (this.state.instances.some((i) => i.name === input.name)) {
        throw new CloudError("CONFLICT", `이미 '${input.name}' 이름의 서버가 있습니다.`, "다른 이름을 사용하세요.");
      }
      if (!(input.spec in SPEC_MONTHLY_COST)) {
        throw new CloudError("INVALID_ARGUMENT", `알 수 없는 사양: ${input.spec}`, "micro, small, medium, large 중 하나를 선택하세요.");
      }
      if (!["dev", "staging", "prod"].includes(input.env)) {
        throw new CloudError("INVALID_ARGUMENT", `알 수 없는 환경: ${input.env}`, "dev, staging, prod 중 하나를 선택하세요.");
      }
      const zone = input.zone ?? ZONES[0];
      if (!(ZONES as readonly string[]).includes(zone)) {
        throw new CloudError("INVALID_ARGUMENT", `알 수 없는 존: ${zone}`, `${ZONES.join(", ")} 중 하나를 선택하세요.`);
      }
      const sgId = input.securityGroupId ?? "sg-default";
      this.findSecurityGroup(sgId);
      if (this.state.instances.length >= INSTANCE_QUOTA) {
        throw new CloudError(
          "QUOTA_EXCEEDED",
          `서버 한도(${INSTANCE_QUOTA}대)를 초과했습니다.`,
          "사용하지 않는 서버를 삭제한 뒤 다시 시도하세요.",
        );
      }

      const instance: Instance = {
        id: `srv-${String(++this.idCounter).padStart(4, "0")}`,
        name: input.name,
        env: input.env,
        spec: input.spec,
        status: "creating",
        zone,
        publicIp: null,
        securityGroupId: sgId,
        createdAt: this.now().toISOString(),
        monthlyCost: SPEC_MONTHLY_COST[input.spec],
      };
      this.state.instances.push(instance);
      this.later(() => {
        instance.status = "running";
        if (input.assignPublicIp) instance.publicIp = `211.188.99.${this.idCounter % 250}`;
      });
      return { ...instance };
    });
  }

  stopInstance(id: string, actor: Actor = "unknown"): Instance {
    return this.record(actor, "instance.stop", id, () => {
      const instance = this.findInstance(id);
      if (instance.status !== "running") {
        throw new CloudError("INVALID_STATE", `'${instance.name}'은(는) 실행 중이 아닙니다 (현재: ${instance.status}).`, "실행 중인 서버만 정지할 수 있습니다.");
      }
      instance.status = "stopping";
      this.later(() => (instance.status = "stopped"));
      return { ...instance };
    });
  }

  startInstance(id: string, actor: Actor = "unknown"): Instance {
    return this.record(actor, "instance.start", id, () => {
      const instance = this.findInstance(id);
      if (instance.status !== "stopped") {
        throw new CloudError("INVALID_STATE", `'${instance.name}'은(는) 정지 상태가 아닙니다 (현재: ${instance.status}).`, "정지된 서버만 시작할 수 있습니다.");
      }
      instance.status = "starting";
      this.later(() => (instance.status = "running"));
      return { ...instance };
    });
  }

  /** 실제 클라우드처럼 실행 중인 서버는 바로 삭제(반납)할 수 없다. */
  deleteInstance(id: string, actor: Actor = "unknown"): Instance {
    return this.record(actor, "instance.delete", id, () => {
      const instance = this.findInstance(id);
      if (instance.status !== "stopped") {
        throw new CloudError(
          "INVALID_STATE",
          `'${instance.name}'은(는) 정지 상태가 아니라 삭제할 수 없습니다 (현재: ${instance.status}).`,
          "먼저 서버를 정지한 뒤 상태가 stopped가 되면 삭제하세요.",
        );
      }
      instance.status = "deleting";
      this.later(() => {
        this.state.instances = this.state.instances.filter((i) => i.id !== id);
      });
      return { ...instance };
    });
  }

  // ---------- 보안 그룹 ----------

  addSecurityRule(sgId: string, input: AddRuleInput, actor: Actor = "unknown"): SecurityGroup {
    return this.record(actor, "securityGroup.addRule", sgId, () => {
      const sg = this.findSecurityGroup(sgId);
      if (!Number.isInteger(input.port) || input.port < 1 || input.port > 65535) {
        throw new CloudError("INVALID_ARGUMENT", `포트 번호가 올바르지 않습니다: ${input.port}`, "1~65535 사이 정수를 입력하세요.");
      }
      if (!/^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(input.source)) {
        throw new CloudError("INVALID_ARGUMENT", `접근 소스 형식이 올바르지 않습니다: ${input.source}`, "CIDR 형식(예: 203.0.113.7/32)으로 입력하세요.");
      }
      if (sg.rules.some((r) => r.protocol === input.protocol && r.port === input.port && r.source === input.source)) {
        throw new CloudError("CONFLICT", "같은 규칙이 이미 있습니다.");
      }
      sg.rules.push({
        id: `rule-${++this.idCounter}`,
        protocol: input.protocol,
        port: input.port,
        source: input.source,
        description: input.description ?? "",
      });
      return structuredClone(sg);
    });
  }

  removeSecurityRule(sgId: string, ruleId: string, actor: Actor = "unknown"): SecurityGroup {
    return this.record(actor, "securityGroup.removeRule", `${sgId}/${ruleId}`, () => {
      const sg = this.findSecurityGroup(sgId);
      if (!sg.rules.some((r) => r.id === ruleId)) {
        throw new CloudError("NOT_FOUND", `규칙을 찾을 수 없습니다: ${ruleId}`);
      }
      sg.rules = sg.rules.filter((r) => r.id !== ruleId);
      return structuredClone(sg);
    });
  }

  // ---------- 버킷 ----------

  setBucketPublic(id: string, isPublic: boolean, actor: Actor = "unknown"): Bucket {
    return this.record(actor, isPublic ? "bucket.makePublic" : "bucket.makePrivate", id, () => {
      const bucket = this.findBucket(id);
      bucket.public = isPublic;
      return { ...bucket };
    });
  }

  emptyBucket(id: string, actor: Actor = "unknown"): Bucket {
    return this.record(actor, "bucket.empty", id, () => {
      const bucket = this.findBucket(id);
      bucket.objectCount = 0;
      return { ...bucket };
    });
  }

  deleteBucket(id: string, actor: Actor = "unknown"): Bucket {
    return this.record(actor, "bucket.delete", id, () => {
      const bucket = this.findBucket(id);
      if (bucket.objectCount > 0) {
        throw new CloudError(
          "BUCKET_NOT_EMPTY",
          `'${bucket.name}' 버킷에 객체 ${bucket.objectCount}개가 남아 있습니다.`,
          "버킷을 비운 뒤 삭제하세요.",
        );
      }
      this.state.buckets = this.state.buckets.filter((b) => b.id !== id);
      return { ...bucket };
    });
  }

  // ---------- 내부 ----------

  private findInstance(id: string): Instance {
    const found = this.state.instances.find((i) => i.id === id);
    if (!found) throw new CloudError("NOT_FOUND", `서버를 찾을 수 없습니다: ${id}`, "서버 목록에서 id를 다시 확인하세요.");
    return found;
  }

  private findSecurityGroup(id: string): SecurityGroup {
    const found = this.state.securityGroups.find((s) => s.id === id);
    if (!found) throw new CloudError("NOT_FOUND", `보안 그룹을 찾을 수 없습니다: ${id}`);
    return found;
  }

  private findBucket(id: string): Bucket {
    const found = this.state.buckets.find((b) => b.id === id);
    if (!found) throw new CloudError("NOT_FOUND", `버킷을 찾을 수 없습니다: ${id}`);
    return found;
  }

  private later(fn: () => void) {
    if (this.delay <= 0) {
      fn();
      return;
    }
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, this.delay);
    this.timers.add(t);
  }

  private record<T>(actor: Actor, action: string, target: string | null, fn: () => T): T {
    const entry: AuditEntry = { seq: ++this.seq, at: this.now().toISOString(), actor, action, target, ok: true };
    try {
      return fn();
    } catch (err) {
      entry.ok = false;
      entry.errorCode = err instanceof CloudError ? err.code : "INTERNAL";
      throw err;
    } finally {
      this.audit.push(entry);
    }
  }
}
