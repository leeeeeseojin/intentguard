import type { AuditSummary } from "../../src/app/audits";
import { AUDIT_STATE, auditHref, OUTCOME } from "./text";

function summary({ state, outcomes }: AuditSummary): string {
  if (state !== "finished") return AUDIT_STATE[state];
  const done = outcomes.filter((outcome) => outcome !== null);
  if (!done.length) return "검사하지 못함";
  return done.map((outcome) => OUTCOME[outcome].title).join(" / ");
}

export function History({ audits }: { audits: AuditSummary[] }) {
  if (!audits.length) return null;
  return (
    <section className="app-history" aria-labelledby="history">
      <h3 id="history">지난 검사</h3>
      <ul>
        {audits.map((audit) => (
          <li key={audit.id}>
            <a href={auditHref(audit.id)}>
              <span className="app-history-site">
                {audit.number}. {new URL(audit.url).host}
              </span>
              <span className="app-history-task">{audit.task}</span>
              <span className="app-history-state">{summary(audit)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
