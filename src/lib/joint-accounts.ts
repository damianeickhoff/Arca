import type Database from "better-sqlite3";
import { JOINT_TYPE, MIN_MATCH_NAME_LENGTH } from "@/lib/account-names";

// A joint account kept by hand (vermogen_accounts.type "gezamenlijk") is where the
// household's money goes: what you put into it is spending (it stays in your reports,
// for you to file under a household category), and money it pays back to you is not
// income. That payback is stored as is_reimbursement, like a Tikkie found at import,
// so the owner can still unmark one by hand. Once the joint account is imported itself,
// it is a bank account and its own transactions show the spending.

const NUMBER = `upper(replace(coalesce(v.account_number, ''), ' ', ''))`;
const COUNTER = `upper(replace(coalesce(t.counter_account, ''), ' ', ''))`;
const DESCRIPTION = `lower(replace(coalesce(t.description, ''), ' ', ''))`;
const RAW = `lower(replace(coalesce(t.raw_description, ''), ' ', ''))`;

const POINTS_AT_JOINT = `exists (
  select 1 from vermogen_accounts v
  where v.active = 1 and v.type = '${JOINT_TYPE}'
    and (
      (${NUMBER} <> '' and (${COUNTER} = ${NUMBER} or instr(${DESCRIPTION}, lower(${NUMBER})) > 0 or instr(${RAW}, lower(${NUMBER})) > 0))
      or exists (
        select 1 from json_each(case when json_valid(v.match_names) then v.match_names else '[]' end) n
        where length(replace(n.value, ' ', '')) >= ${MIN_MATCH_NAME_LENGTH}
          and (instr(${DESCRIPTION}, lower(replace(n.value, ' ', ''))) > 0 or instr(${RAW}, lower(replace(n.value, ' ', ''))) > 0)
      )
    )
)`;

/**
 * Marks money coming back from a joint account as paid back (not income): imported
 * income rows without a category that aren't marked already. Only `ids` when given (an
 * import's new rows), else every row (a joint account was just added or changed).
 * Returns how many rows it marked.
 */
export function markJointPaybacks(sqlite: Database.Database, ids?: number[]): number {
  if (ids && ids.length === 0) return 0;
  const only = ids ? `and t.id in (select value from json_each(?))` : "";
  const statement = sqlite.prepare(
    `update transactions set is_reimbursement = 1
      where id in (
        select t.id from transactions t
         where t.direction = 'income' and t.is_reimbursement = 0 and t.category_id is null
           and t.is_manual_transfer = 0 and t.source in ('csv_import', 'bank')
           ${only}
           and ${POINTS_AT_JOINT}
      )`,
  );
  return (ids ? statement.run(JSON.stringify(ids)) : statement.run()).changes;
}
