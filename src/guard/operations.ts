import type { MiniCloud } from "../domain/store.js";
import type { Actor, AddRuleInput, CreateInstanceInput } from "../domain/types.js";

/** 상태를 바꾸는 모든 작업. IntentGuard는 이 단위로 위험도를 판단하고 승인을 보류한다. */
export type Operation =
  | { kind: "instance.create"; input: CreateInstanceInput }
  | { kind: "instance.stop"; id: string }
  | { kind: "instance.start"; id: string }
  | { kind: "instance.delete"; id: string }
  | { kind: "securityGroup.addRule"; sgId: string; input: AddRuleInput }
  | { kind: "securityGroup.removeRule"; sgId: string; ruleId: string }
  | { kind: "bucket.setPublic"; id: string; public: boolean }
  | { kind: "bucket.empty"; id: string }
  | { kind: "bucket.delete"; id: string };

export function execute(cloud: MiniCloud, op: Operation, actor: Actor): unknown {
  switch (op.kind) {
    case "instance.create":
      return cloud.createInstance(op.input, actor);
    case "instance.stop":
      return cloud.stopInstance(op.id, actor);
    case "instance.start":
      return cloud.startInstance(op.id, actor);
    case "instance.delete":
      return cloud.deleteInstance(op.id, actor);
    case "securityGroup.addRule":
      return cloud.addSecurityRule(op.sgId, op.input, actor);
    case "securityGroup.removeRule":
      return cloud.removeSecurityRule(op.sgId, op.ruleId, actor);
    case "bucket.setPublic":
      return cloud.setBucketPublic(op.id, op.public, actor);
    case "bucket.empty":
      return cloud.emptyBucket(op.id, actor);
    case "bucket.delete":
      return cloud.deleteBucket(op.id, actor);
  }
}
