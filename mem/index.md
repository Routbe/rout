# Project Memory

## Core
Privacy en data-soevereiniteit staan op 1: geen gedragstracking, geen metadata-logging, geen gebruikersprofilering.
Short links slaan alleen minimale routing op (hash -> doel-URL). Geen IP-adressen, tracking pixels of extra logs.
Geen auditlog voor link- of profielwijzigingen — expliciet afgewezen om privacyredenen.
Publieke reads van profielen gaan via get_public_profile; e-mail, moderatie- en betaalvelden blijven server-only.
Beveiligingsscan loopt automatisch via .github/workflows/security-scan.yml bij elke push/PR.

## Memories
- [Privacy-constraints](mem://constraints/privacy) — wat wel/niet mag worden gelogd of getrackt