export type Env = "dev" | "staging" | "prod";
export type InstanceSpec = "micro" | "small" | "medium" | "large";
export type InstanceStatus =
  | "creating"
  | "running"
  | "stopping"
  | "stopped"
  | "starting"
  | "deleting";

export interface Instance {
  id: string;
  name: string;
  env: Env;
  spec: InstanceSpec;
  status: InstanceStatus;
  zone: string;
  publicIp: string | null;
  securityGroupId: string;
  createdAt: string;
  monthlyCost: number;
}

export interface SecurityRule {
  id: string;
  protocol: "tcp" | "udp";
  port: number;
  source: string;
  description: string;
}

export interface SecurityGroup {
  id: string;
  name: string;
  rules: SecurityRule[];
}

export interface Bucket {
  id: string;
  name: string;
  env: Env;
  public: boolean;
  objectCount: number;
  createdAt: string;
}

export type Actor = "human" | "agent" | "unknown";

export interface AuditEntry {
  seq: number;
  at: string;
  actor: Actor;
  action: string;
  target: string | null;
  ok: boolean;
  errorCode?: string;
}

export interface CreateInstanceInput {
  name: string;
  env: Env;
  spec: InstanceSpec;
  zone?: string;
  securityGroupId?: string;
  assignPublicIp?: boolean;
}

export interface AddRuleInput {
  protocol: "tcp" | "udp";
  port: number;
  source: string;
  description?: string;
}

export const SPEC_MONTHLY_COST: Record<InstanceSpec, number> = {
  micro: 9_000,
  small: 24_000,
  medium: 52_000,
  large: 110_000,
};

export const ZONES = ["KR-1", "KR-2"] as const;
export const INSTANCE_QUOTA = 20;
