# MinPlan – arbetsplan

Appen heter **MinPlan** på alla språk (rubrik, flik, manifest, notiser, filnamn). Interna nycklar (`arshjul:` i localStorage, kodprefixet `ARSHJUL1.`) behålls så att sparad data och delade koder fungerar.

Mock-up: `mockup.html` (förhandsvisning: `mockup.png`). Mock-upen är en skiss; datamodellen nedan gäller.

## Bakåtkompatibilitet (viktigast av allt)
Ny version får **aldrig** ta bort användarens uppgifter eller förstöra inställningar.
- Dataformatet (`format: 1`) utökas bara med valfria fält; äldre data läses som förut. Höjs `format` krävs migrering i `sanitize()`.
- Data från en nyare version (högre `format`) eller trasig JSON läses inte, men tas aldrig bort.
- Tappar valideringen något (trasig uppgift/period/enhet) sparas originalet orört i `arshjul:backup:<id>` innan något skrivs.
- Inställningsnycklar byter aldrig namn; gamla läses som reserv (t.ex. `last` → `shown`).
- Automatisk städning rör bara det appen själv skapat och användaren aldrig ändrat (oanvänt standardhjul, oförändrade exempel). Bockar räknas inte som ändring.
- Flera flikar: hjul som ändras i en annan flik läses in direkt (`storage`-händelsen), så en gammal kopia skriver aldrig över nyare data.
- Migreringar testas med lagring från äldre versioner (`migrate.js`-scenarier: oanvänt standardhjul, standardhjul med uppgifter, äldre exempel, omdöpt hjul).

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
          notering, punkter: [text], klart: { "ÅÅÅÅ": [index] }, skapad: "ÅÅÅÅ-MM-DD",
          notis: bool,    // notis när försenad; saknas = på
          rule?: { month: 1–12, nth: 1–4 | -2 | -1, weeks: 1–26 },  // veckoregel, se nedan
          remind?: 0–365 } // påminnelse N dagar före start; saknas = ingen
```
- **Grupper** heter `units` i koden och i sparad data (hette "enheter" i gränssnittet före v0.16). Bara texterna bytte namn.
- Nycklar på engelska i koden (`name`, `units`, `tasks`, `title`, `items`, `done`, `note`), svenska ovan för läsbarhet.
- `id` = `crypto.randomUUID()`.
- `format` = dataformatets version (heltal). Höjs vid ändrad struktur; `store.js` migrerar äldre format vid inläsning.
- **Inga kategorier.** Färg = enhetens färg (uppgift med flera enheter: första enheten).
- Ny enhet får slumpad färg: `hsl(random 0–359, 65%, 45%)` – läsbar med vit text i både ljust och mörkt läge. Kan ändras i enhetsdialogen.
- **Hjul** = en instans (t.ex. "Förvaltning", "Hemma"). Export = en fil per hjul.

## Flera hjul i samma vy
- Hjulchips överst: klick visar/döljer hjulet, dubbelklick visar bara det. Minst ett hjul visas alltid. Valet sparas (`arshjul:shown`).
- Alla visade hjuls uppgifter, enheter och lediga perioder ritas i **ett gemensamt hjul**. Listan grupperas hjul → enhet.
- ⋯ på hjulchip och hjulrubrik: byt namn, visa bara detta, exportera, ta bort.
- Ny uppgift: kryssa i hjul och grupper i dialogen (en ruta per visat hjul, grupperna under). Kryssas flera hjul får varje hjul en **egen kopia** (nytt id, egen status, inte länkad) – t.ex. budgetplanering både privat och på jobbet. Ändrar man en uppgift och kryssar ur dess hjul flyttas den till det första ikryssade. Period: välj hjul i en lista.
- Dra en uppgift till en enhet i ett annat hjul: uppgiften flyttas dit och får bara den enheten.
- Visningsval (syns med flera hjul): **◎ Samlat** = ett gemensamt hjul, **◫ Sida vid sida** = ett hjul per årshjul i ett rutnät över hela bredden, listan under. Samma filter, månad och år styr alla hjul; hjulen ritas i samma skala. Valet sparas (`arshjul:layout`).
- Kalender (.ics) = alla visade hjul i en fil. Notiser gäller alla sparade hjul.

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

## Veckoregel (uppgifter och perioder)
"Upprepas: Hela veckor varje år" i stället för fasta datum: start = månadens n:e måndag (första–fjärde, näst sista, sista), längd = antal hela veckor (måndag–söndag). Exempel: Black week = sista veckan i oktober; julsemester = från näst sista veckan i december, 4 veckor (två i december + två i januari). Datumen räknas om för varje år (`inYear`/`startDate`/`endDate` i model.js); dialogen visar i år och nästa år. `start`/`end` sparas också (för visat år) så att äldre versioner kan läsa hjulet. iCal: `RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1MO`.

## Lediga perioder (semester, lov)
- `Hjul.periods: [{ id, name, start: "MM-DD", end: "MM-DD", year: null | ÅÅÅÅ }]`. `year: null` = varje år; annars bara det året (lov som flyttar, t.ex. påsklov).
- Ritas som ett band mellan månadsringen och uppgifterna + en svagt tonad sektor bakom uppgifterna.
- Visas överst i listan med veckonummer (ISO 8601), t.ex. "Sommarsemester · v. 28–31".
- Uppgifter som överlappar en period får en märkning med periodens namn.
- Läggs till via +-menyn; klick på bandet eller i listan öppnar den för ändring/borttagning.

## Kalender (iCal)
Knappen "Kalender (.ics)" exporterar alla uppgifter i hjulet som heldagshändelser med `RRULE:FREQ=YEARLY` och en påminnelse kl. 9 på startdagen (med "Påminn mig": N dagar före, kl. 9). Importeras i Outlook, Google eller telefonens kalender, så påminnelser fungerar utan server. `UID` = uppgiftens id, så en ny export uppdaterar i stället för att duplicera (i kalendrar som stöder det).

## Notiser
- 🔔-knapp i sidhuvudet slår på/av. Webbläsaren frågar om tillåtelse vid första klick.
- När appen öppnas (högst en gång per dag) visas en notis med försenade uppgifter i aktuellt hjul som har "Notis när den är försenad" ikryssat.
- **Påminnelser** på uppgifter och perioder: "Påminn mig N dagar före start" (0 = samma dag). Notis en gång per förekomst, från påminnelsedagen till sista dagen (inte för klara uppgifter). Kollas när appen öppnas, när den visas igen och varje timme. Skickade förekomster sparas i `arshjul:reminded` och rensas när förekomsten är över. Bocka i "Påminn mig" ber om lov för notiser direkt.
- iPhone: webbnotiser fungerar bara när appen lagts till på hemskärmen (iOS 16.4+). Kalenderexporten ger påminnelser även när appen är stängd.
- Notiser när appen är stängd kräver Web Push och en server, och väntar till central drift.

## Bekräftelser
Bekräftelser och felmeddelanden visas i sidan (`<dialog>` och en toast), inte med `confirm()`/`alert()`, som blockeras i inbäddade vyer.

## Tema
Knapp i sidhuvudet: system ◐ → ljust ☀ → mörkt ☾. Sätter `data-theme` på `<html>`, valet sparas.

## Inställningar (⚙)
Globala, sparas i webbläsaren och gäller direkt:
- **Utseende:** textstorlek 90–160 % (`--fs`, skalar all text utom hjulets etiketter), sidbredd normal 1200 px / bred 1600 px / hela skärmen (`--page-max`), fördelning hjul/lista (`--c1`/`--c2`, standard lika stora), tema, språk.
- **Hjul:** vilka hjul som visas, samlat/sida vid sida, lägg till från kod.
- **Enheter:** öppnar enhetsdialogen. **Notiser:** på/av.

## Exempel som start
- Exempeldata är standard tills användaren har egna uppgifter: appen lägger till exempelhjulen från `js/example.js` (Förvaltning, Hemma; sv/en, `example: true`) **en gång** (pref `examples`). Gäller både ny användare och befintlig användare utan egna uppgifter. Bockar sätts relativt innevarande år, så exemplet visar klart, pågående och försenat.
- Äldre versioner skapade "Mitt årshjul"/"My annual wheel" med enheten "Jag"/"Me". Är det helt oanvänt (inga uppgifter/perioder, bara den enheten) tas enheten bort och hjulet blir ett tomt exempelhjul. Hjulet tas inte bort automatiskt.
- Nya tomma hjul skapas utan enheter. Hjul utan enheter visar en "Utan enhet"-grupp som tar emot uppgifter (dra och släpp).
- **+ Nytt hjul** öppnar en dialog: namn, börja med *ett tomt hjul* eller *en kopia av exemplet* (utan bockar), och en förvald ruta *Ta bort exempelhjulen först* som bara gäller **oförändrade** exempel. Exempelhjul med egna/ändrade uppgifter eller perioder listas som "behålls" och blir användarens egna.
- En kopia (import, mall) är aldrig ett exempel.

## Import (fil eller kod)
Både Importera (.json) och Från kod leder till samma val:
- **Lägg till som eget hjul med alla uppgifter** (standard).
- **Skriv över ett befintligt hjul helt** – välj hjul (samma hjul som exporterades förväljs), bekräftelse krävs.
Importerat innehåll får alltid nya id för enheter, uppgifter och perioder. En fil behåller sina bockar (backup), en kod har inga.

## Dela med kod
- ⋯ på ett hjul → "Dela…": koden är hjulets JSON, deflate-komprimerad och base64url, med prefixet `ARSHJUL1.`. Ingen server.
- Bockar följer inte med. Mottagaren lägger till via "⇩ Från kod" (eller skriver över ett hjul, se Import) och får ett **eget** hjul: nya id för hjul, enheter, uppgifter och perioder (krockar inte med originalet eller en tidigare kopia), `created` = idag så att inget blir försenat direkt. Allt valideras med `sanitize()`.
- Länk `…#import=ARSHJUL1.…` öppnar dialogen med koden ifylld (visas bara när appen körs på egen adress).
- Engångskopia: senare ändringar synkas inte (kräver central drift).

## Mobil
Fält har minst 16 px text på pekskärmar, annars zoomar iPhone in när man trycker i dem. Zoom med två fingrar är kvar (ingen `maximum-scale`). Öppen +-meny har mörk bakgrund bakom sig.

## Datumfält
Alltid `ÅÅÅÅ-MM-DD` oavsett webbläsarens språk: textfält (inte `type="date"`, som visar lokalt format) + 📅-knapp som öppnar webbläsarens datumväljare via en dold date-input (`showPicker()`). `20260315` rättas till `2026-03-15`. Ogiltiga datum (t.ex. `2026-02-31`) avvisas med ett tydligt meddelande.

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
- Web Share API.
- Web Push (notiser när appen är stängd) via den centrala servern.
