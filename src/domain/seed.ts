import type { Bucket, Env, Instance, InstanceSpec, InstanceStatus, SecurityGroup } from "./types.js";
import { SPEC_MONTHLY_COST } from "./types.js";

export interface CloudState {
  instances: Instance[];
  securityGroups: SecurityGroup[];
  buckets: Bucket[];
}

const BASE_TIME = Date.parse("2026-09-01T09:00:00Z");
const day = (n: number) => new Date(BASE_TIME + n * 86_400_000).toISOString();

type SeedInstance = [name: string, env: Env, spec: InstanceSpec, status: InstanceStatus, sg: string, ip: string | null];

/**
 * 시나리오가 의도적으로 헷갈리도록 구성한 시드 데이터.
 * - dev/staging/prod 이름이 거의 같다 (api-server-dev vs api-server-prod)
 * - 14대라서 페이지 크기 10이면 최신 서버가 2페이지로 밀린다
 */
const SEED_INSTANCES: SeedInstance[] = [
  ["web-frontend-prod", "prod", "medium", "running", "sg-web", "211.188.10.21"],
  ["api-server-prod", "prod", "large", "running", "sg-web", "211.188.10.22"],
  ["db-primary-prod", "prod", "large", "running", "sg-db", null],
  ["batch-worker-prod", "prod", "small", "running", "sg-default", null],
  ["web-frontend-staging", "staging", "small", "running", "sg-web", "211.188.20.11"],
  ["api-server-staging", "staging", "small", "running", "sg-web", "211.188.20.12"],
  ["web-frontend-dev", "dev", "micro", "running", "sg-web", "211.188.30.11"],
  ["api-server-dev", "dev", "micro", "running", "sg-web", "211.188.30.12"],
  ["db-dev", "dev", "small", "running", "sg-db", null],
  ["batch-worker-dev", "dev", "micro", "stopped", "sg-default", null],
  ["api-server-dev-old", "dev", "micro", "stopped", "sg-default", null],
  ["ml-notebook-dev", "dev", "medium", "running", "sg-ssh", "211.188.30.31"],
  ["log-collector-prod", "prod", "small", "running", "sg-default", null],
  ["test-runner-dev", "dev", "micro", "stopped", "sg-default", null],
];

export function createSeedState(): CloudState {
  const instances: Instance[] = SEED_INSTANCES.map(([name, env, spec, status, sg, ip], i) => ({
    id: `srv-${String(i + 1).padStart(4, "0")}`,
    name,
    env,
    spec,
    status,
    zone: i % 3 === 2 ? "KR-2" : "KR-1",
    publicIp: ip,
    securityGroupId: sg,
    createdAt: day(i * 3),
    monthlyCost: SPEC_MONTHLY_COST[spec],
  }));

  const securityGroups: SecurityGroup[] = [
    {
      id: "sg-default",
      name: "default",
      rules: [],
    },
    {
      id: "sg-web",
      name: "web-public",
      rules: [
        { id: "rule-1", protocol: "tcp", port: 80, source: "0.0.0.0/0", description: "HTTP" },
        { id: "rule-2", protocol: "tcp", port: 443, source: "0.0.0.0/0", description: "HTTPS" },
      ],
    },
    {
      id: "sg-db",
      name: "db-private",
      rules: [{ id: "rule-3", protocol: "tcp", port: 5432, source: "10.0.0.0/16", description: "PostgreSQL (VPC 내부)" }],
    },
    {
      id: "sg-ssh",
      name: "ssh-admin",
      rules: [{ id: "rule-4", protocol: "tcp", port: 22, source: "203.0.113.7/32", description: "관리자 사무실" }],
    },
  ];

  const buckets: Bucket[] = [
    { id: "bkt-1", name: "logs-prod", env: "prod", public: false, objectCount: 12_840, createdAt: day(2) },
    { id: "bkt-2", name: "assets-prod", env: "prod", public: true, objectCount: 532, createdAt: day(4) },
    { id: "bkt-3", name: "backup-dev", env: "dev", public: false, objectCount: 0, createdAt: day(10) },
    { id: "bkt-4", name: "tmp-dev", env: "dev", public: false, objectCount: 37, createdAt: day(20) },
  ];

  return { instances, securityGroups, buckets };
}
