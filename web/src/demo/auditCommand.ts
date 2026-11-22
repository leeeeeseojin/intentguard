export const SETUP_COMMANDS = [
  "git clone https://github.com/leeeeeseojin/intentguard.git",
  "cd intentguard",
  "pnpm install",
  "pnpm exec playwright install chromium",
];

export function validTarget(value: string): boolean {
  try {
    const { protocol } = new URL(value.trim());
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * PowerShell·bash·zsh 모두에서 그대로 한 인자가 되도록 작은따옴표로 감싼다.
 * 따옴표 이스케이프는 셸마다 달라서 작은따옴표와 줄바꿈은 값에서 바꾼다. PowerShell은 굽은 따옴표도 따옴표로 읽는다.
 */
const quote = (value: string) => `'${value.trim().replace(/['\u2018\u2019\u201a\u201b]/g, "`").replace(/\s+/g, " ")}'`;

export function auditCommand(url: string, task: string, expected: string): string {
  return `pnpm exec tsx src/audit/cli.ts --url ${quote(new URL(url.trim()).href)} --task ${quote(task)} --expect ${quote(expected)}`;
}
