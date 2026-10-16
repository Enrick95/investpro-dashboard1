"use client";
import { useId, type FormEvent } from "react";
import { Check, Loader2, Search, UserRound } from "lucide-react";
import s from "./StaffTeam.module.css";

export type StaffMember = { user_id: string; name: string; email: string; is_owner: boolean };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function staffMatches(value: unknown): StaffMember[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is StaffMember => row !== null && typeof row === "object" && uuid.test(row.user_id) && typeof row.name === "string" && row.name.length > 0 && typeof row.email === "string" && typeof row.is_owner === "boolean").slice(0, 10);
}
type Props = {
  english: boolean; query: string; matches: StaffMember[]; member: StaffMember | null;
  searching: boolean; searched: boolean; error: string; disabled: boolean;
  onQuery: (query: string) => void; onSearch: () => void;
  onChoose: (member: StaffMember) => void; onClear: () => void;
};
export default function StaffMemberPicker({ english, query, matches, member, searching, searched, error, disabled, onQuery, onSearch, onChoose, onClear }: Props) {
  const id = useId();
  const tr = (fr: string, en: string) => english ? en : fr;
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSearch(); }
  if (member) return <div className={s.selectedMember}>
    <span className={s.memberIcon}><Check size={20} aria-hidden="true" /></span>
    <div className={s.identity}><span className={s.eyebrow}>{tr("Compte sélectionné", "Selected account")}</span><strong>{member.name}</strong><span>{member.email || tr("Adresse e-mail indisponible", "Email unavailable")}</span></div>
    <button type="button" onClick={onClear} disabled={disabled} className={s.secondary}>{tr("Changer", "Change")}</button>
  </div>;
  return <div className={s.picker}><form onSubmit={submit}>
    <label htmlFor={id} className={s.label}>{tr("Rechercher un membre", "Find a member")}</label>
    <p id={`${id}-hint`} className={s.hint}>{tr("Saisissez son pseudo, son nom ou son e-mail, puis sélectionnez son compte.", "Enter their username, name or email, then select their account.")}</p>
    <div className={s.searchRow}><div className={s.inputWrap}><Search size={18} aria-hidden="true" /><input id={id} value={query} onChange={event => onQuery(event.target.value)} placeholder={tr("Ex. Kenn97 ou adresse e-mail", "Username or email address")} autoComplete="off" maxLength={254} aria-describedby={`${id}-hint`} disabled={disabled} /></div>
      <button type="submit" disabled={disabled || searching || query.trim().length < 2} className={s.secondary}>{searching ? <Loader2 size={17} className={s.spin} aria-hidden="true" /> : <Search size={17} aria-hidden="true" />}{tr("Rechercher", "Search")}</button>
    </div></form>
    {searching ? <p className={s.hint} role="status">{tr("Recherche du compte…", "Finding the account…")}</p> : null}
    {error ? <p className={s.error} role="alert">{error}</p> : null}
    {!searching && searched && !error && matches.length === 0 ? <p className={s.hint} role="status">{tr("Aucun compte trouvé. Vérifiez le pseudo ou l’e-mail. La personne doit d’abord créer son compte InvestPro.", "No account found. Check the username or email. They must create an InvestPro account first.")}</p> : null}
    {matches.length ? <ul className={s.results} aria-label={tr("Comptes trouvés", "Matching accounts")}>{matches.map(match => <li key={match.user_id}><button type="button" className={s.result} disabled={disabled || match.is_owner} onClick={() => onChoose(match)}>
      <span className={s.memberIcon}><UserRound size={19} aria-hidden="true" /></span><span className={s.identity}><strong>{match.name}</strong><span>{match.email || tr("Adresse e-mail indisponible", "Email unavailable")}</span></span><span className={s.resultAction}>{match.is_owner ? tr("Propriétaire", "Owner") : tr("Sélectionner", "Select")}</span>
    </button></li>)}</ul> : null}
  </div>;
}
