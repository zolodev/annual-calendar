# Årshjul – arbetsplan

Mock-up: `mockup.html` (förhandsvisning: `mockup.png`). Mock-upen är en skiss; datamodellen nedan gäller.

## Principer
- Vanilla JS (ES modules), inget ramverk, inget byggsteg, **inga beroenden**.
- Ett enda JSON-format överallt: lagring, export, import.
- SVG ritas från data. Ingen logik utöver "datum → vinkel".
- Personligt verktyg: ingen inloggning, inga roller.
- Inga begränsningar: valfri textlängd, valfritt antal uppgifter per månad.

## Årligen återkommande
Hjulet är **årslöst**. Alla uppgifter gäller varje år automatiskt – inget kopieras.
- Datum lagras som `MM-DD` (inget år).
- `slut` < `start` betyder att uppgiften går över årsskiftet (t.ex. `11-15` → `01-20`). Hjulet är cirkulärt, så bågen ritas rakt över toppen – ingen klippning.
- `02-29` behandlas som `02-28`. Vinkel räknas på ett fast 365-dagarsår.
- Checklistans status lagras **per år** (`klart: {"2026": [0,2]}` = punkt 0 och 2 klara 2026). Nytt år = tomma bockar automatiskt. Gamla år ligger kvar som historik.
- Året i mitten = visat år, standard innevarande år. Små pilar ‹ › bläddrar år (visar det årets bockar = historik). Inga data ändras av att bläddra.

## Status: klar / ej klar / försenad
- En uppgift (för ett visst år) är **klar** när alla punkter är bockade. Uppgift utan punkter visar en egen bock "Klar" (lagras som index 0).
  Regel: `klar = (klart[år] ?? []).length >= max(1, punkter.length)`.
- **Försenad** = slutdatum har passerat och uppgiften är inte klar.
- **Överföring:** för varje uppgift kontrolleras dess *senaste avslutade förekomst* (i år om slutdatum passerat, annars förra året). Är den inte klar visas den överst i listan för valfri månad, märkt "Försenad · dec 2025", tills den bockas av. Ex: Budget dec 2025 ej klar → syns i januari, februari … 2026.
- Förekomster före `skapad` räknas aldrig som försenade (annars blir nya uppgifter direkt försenade).
- Bockar man av en överförd uppgift skrivs det på dess ursprungsår (`klart["2025"]`).

## Datamodell
```
Hjul    { format: 1, id, namn, enheter: {id: {namn, färg}}, uppgifter: [] }
Uppgift { id, enheter: [enhetId], titel, start: "MM-DD", slut: "MM-DD",
          notering, punkter: [text], klart: { "ÅÅÅÅ": [index] }, skapad: "ÅÅÅÅ-MM-DD" }
```
- Nycklar på engelska i koden (`name`, `units`, `tasks`, `title`, `items`, `done`, `note`), svenska ovan för läsbarhet.
- `id` = `crypto.randomUUID()`.
- `format` = dataformatets version (heltal). Höjs vid ändrad struktur; `store.js` migrerar äldre format vid inläsning.
- **Inga kategorier.** Färg = enhetens färg (uppgift med flera enheter: första enheten).
- Ny enhet får slumpad färg: `hsl(random 0–359, 65%, 45%)` – läsbar med vit text i både ljust och mörkt läge. Kan ändras i enhetsdialogen.
- **Hjul** = en instans (t.ex. "Förvaltning", "Hemma"). Flera hjul, väljs i rubriken. Export = ett hjul som fil.

## Filter
Två filter som kombineras (OCH):
- **Enhet:** chips överst. Klick = visa en enhet, Ctrl/Cmd-klick = lägg till fler, "Alla" = nollställ. Varje chip visar `klara/totalt` för visat år, t.ex. `IT 3/7`.
- **Status:** segmentknapp `Alla · Ej klara · Klara`. "Ej klara" inkluderar försenade.

Båda styr hjul (ej matchande bågar dämpas), lista, sök och "% klart". Exempel: enhet = IT + status = Ej klara → allt IT har kvar, inklusive försenat från förra året.

## Språk (sv/en)
- `js/i18n.js`: två objekt `{sv:{…}, en:{…}}` + `t(key)`.
- Standard från `navigator.language`, byts med knapp i sidhuvudet, valet sparas i `localStorage`.
- Månadsnamn och datum via `Intl.DateTimeFormat(lang)` – ingen egen översättning behövs.
- Användarens egna texter översätts inte.

## Säkerhet (XSS)
- All användartext går genom `esc()` innan den hamnar i `innerHTML` (eller sätts via `textContent`).
- Färger valideras mot `/^#[0-9a-f]{6}$|^hsl\(\d+, ?\d+%, ?\d+%\)$/i` – annars ersätts med slumpad färg.
- Import valideras: rätt `format`, rätt typer, okända fält kastas. Ogiltig fil → felmeddelande, inget skrivs.
- CSP i `index.html`: `default-src 'self'; style-src 'self' 'unsafe-inline'` (inline-style behövs för färger). Inga inline-skript.

## Versionsnumrering
- `js/version.js`: `export const VERSION = '0.1.0'` (semver) – enda stället versionen anges.
- Visas diskret i sidfoten: `Årshjul v0.1.0`.
- Service workerns cachenamn = `arshjul-${VERSION}` → ny version rensar gammal cache automatiskt.
- `format` (data) och `VERSION` (app) är separata.

## Filstruktur
```
index.html            sidstruktur + CSP + sidfot
manifest.webmanifest, sw.js   PWA
icon.svg              app-ikon
js/version.js         VERSION
js/i18n.js            sv/en-texter, t()
js/model.js           ren logik: datum, status, försenat, lanes, sök, esc() (testbar utan DOM)
js/store.js           localStorage, lista/ladda/spara/ta bort hjul, export/import, validering, migrering
js/wheel.js           data → SVG
js/app.js             panel, filter, sök, dialoger, events
css/app.css
test/model.test.js    bun test
```
`store.js` har ett litet gränssnitt (`list/load/save/remove`) så att det senare kan bytas mot en central server utan att resten ändras.

## Lagring
- `localStorage`: `hjul:<id>` per hjul, `hjul:senast` = senast öppnade, `lang`.
- `navigator.storage.persist()` vid start.
- Sidfoten visar "Senast exporterad: …" och påminner om export efter 30 dagar.

## Hjul utan begränsningar
- Lanes tilldelas som i mock-upen, men **inget tak**: fler överlappande uppgifter = fler ringar utåt, `viewBox` växer med antal ringar.
- Etikett på bågen bara om den får plats; annars `<title>` + listan. Text i nedre halvan ritas med omvänd båge så den inte blir upp-och-ned.
- Listan till höger är huvudvyn för detaljer och fungerar med tangentbord.
- Försenade bågar får röd streckad kant; mitten visar `x försenade` under "% klart".

## Sök
Enkel `includes()` på titel, notering och punkter, efter `toLowerCase()` + `normalize('NFD')` (å/ä/ö matchar a/o).

## Faser
1. **Skelett** – mock-up → filerna ovan, ny datamodell (MM-DD, inga kategorier), i18n, `esc()`, version i sidfot, status-/enhetsfilter, försenat-logik, årspilar.
2. **Lagring + export/import** – localStorage, flera hjul, hjulväljare, validering vid import (nytt hjul, eller ersätt om samma `id` efter bekräftelse).
3. **Redigering** – `<dialog>` för uppgift (titel, enheter, start/slut, notering, punkter) och enhet (namn, färg).
4. **PWA** – manifest, `sw.js` (cache-first, cachenamn med VERSION), installerbar.
5. **Polish** – tangentbord, utskrift/PDF, mörkt läge, export-påminnelse.

## Senare (inte nu)
- Central drift: samma statiska filer på en webbserver; `store.js` byts mot REST-anrop.
- Web Share API, iCal-export.
