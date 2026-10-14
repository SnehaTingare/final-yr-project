import React, {useState} from "react";
import {CircleHelp, Search} from "lucide-react";
import {useI18n} from "../../i18n/react.jsx";
const topics = ["registration", "recommendations", "applications", "allocation", "navigation", "recovery"];
export default function HelpSupport() {
  const {t} = useI18n(); const [query, setQuery] = useState("");
  const filtered = topics.filter(topic => `${t(`help.${topic}.q`)} ${t(`help.${topic}.a`)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <section className="vendor-support-workspace"><header className="vendor-support-heading"><CircleHelp size={24}/><div><h1>{t("help.title")}</h1><p>{t("help.intro")}</p></div></header><label className="vendor-help-search"><Search size={18}/><input aria-label={t("help.search")} placeholder={t("help.search")} value={query} onChange={event => setQuery(event.target.value)}/></label><div className="vendor-help-grid">{filtered.map(topic => <details className="vendor-panel vendor-faq" key={topic}><summary>{t(`help.${topic}.q`)}</summary><p>{t(`help.${topic}.a`)}</p></details>)}</div>{!filtered.length && <p role="status">{t("help.noMatches")}</p>}<p className="field-note">{t("help.contactNotice")}</p></section>;
}
