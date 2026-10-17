// Exempelhjul som appen startar med första gången. Markeras med example: true så att de kan
// tas bort när man skapar ett eget hjul. Bockar sätts relativt innevarande år så att exemplet
// visar både klart, pågående och försenat (t.ex. Remiss från förra året).
import { FORMAT } from './store.js';

// Exempeluppgifter och perioder som de ser ut i mallen (båda språken). Bockar räknas inte –
// det som jämförs är innehållet, så att en uppgift man ändrat räknas som ens egen.
const sig = x => JSON.stringify([x.id, x.title ?? x.name, x.start, x.end, x.note ?? '', x.items ?? []]);
let pristine;
const known = () => (pristine ??= new Set(['sv', 'en'].flatMap(l => exampleWheels(l).flatMap(w => [...w.tasks, ...w.periods].map(sig)))));

// Exempelhjul som kan tas bort utan att något av användarens eget försvinner:
// varje uppgift och period är oförändrad från mallen (eller hjulet är tomt).
export const isPristineExample = w => w.example === true && [...w.tasks, ...w.periods].every(x => known().has(sig(x)));

// Hjul som äldre versioner skapade automatiskt ("Mitt årshjul" med enheten "Jag") och som aldrig använts.
const DEFAULT_NAMES = ['Mitt årshjul', 'My annual wheel'], DEFAULT_UNITS = ['Jag', 'Me'];
export const isUnusedDefault = w => !w.example && !w.tasks.length && !w.periods.length && DEFAULT_NAMES.includes(w.name) &&
  Object.keys(w.units).length <= 1 && Object.values(w.units).every(u => DEFAULT_UNITS.includes(u.name));

export function exampleWheels(lang, now = new Date()) {
  const y = now.getFullYear(), p = y - 1, created = `${p}-01-01`;
  const L = (sv, en) => (lang === 'sv' ? sv : en);
  const task = (id, title, units, start, end, items, done, note = '') =>
    ({ id, title, units, start, end, note, items, done, created, notify: true });
  return [
    {
      format: FORMAT, id: 'exempel', example: true, name: L('Exempel: Förvaltning', 'Example: Operations'),
      units: {
        it: { name: L('IT & Säkerhet', 'IT & Security'), color: '#7c3aed' },
        ek: { name: L('Ekonomi', 'Finance'), color: '#0891b2' },
        hr: { name: 'HR', color: '#db2777' },
      },
      tasks: [
        task('e1', L('Verksamhetsplan', 'Business plan'), ['it', 'ek', 'hr'], '01-05', '02-13',
          [L('Utvärdera föregående år', 'Review last year'), L('Ta fram mål', 'Set goals'), L('Fastställ i ledningsgrupp', 'Approve in management')], { [y]: [0, 1, 2] }),
        task('e2', L('Bokslut & årsredovisning', 'Year-end closing'), ['ek'], '01-15', '03-15',
          [L('Stäng räkenskaper', 'Close the books'), L('Skriv årsredovisning', 'Write annual report'), L('Skicka in', 'Submit')], { [y]: [0, 1, 2], [p]: [0, 1, 2] }),
        task('e3', L('Medarbetarsamtal', 'Performance reviews'), ['hr'], '04-06', '05-29',
          [L('Boka tider', 'Book meetings'), L('Genomför samtal', 'Hold reviews')], { [y]: [0, 1], [p]: [0, 1] }, L('Boka 45 min per person.', 'Book 45 min per person.')),
        task('e4', L('Brandskydd & utrymning', 'Fire safety drill'), ['it'], '05-04', '05-15', [], { [y]: [0], [p]: [0] }),
        task('e5', L('Delårsrapport', 'Interim report'), ['ek'], '07-20', '08-14',
          [L('Sammanställ utfall', 'Compile results'), L('Prognos helår', 'Full-year forecast')], { [y]: [0], [p]: [0, 1] }),
        task('e6', L('Säkerhetsgenomgång', 'Security review'), ['it'], '10-01', '10-31',
          [L('Uppdatera kontaktlistor', 'Update contact lists'), L('Byt lösenord på servrar', 'Rotate server passwords'),
            L('Kontrollera backuper (test-restore)', 'Check backups (test restore)'), L('Granska tillträde i passersystemet', 'Review access control')],
          { [y]: [0], [p]: [0, 1, 2, 3] }),
        task('e7', L('Budget', 'Budget'), ['it', 'ek'], '10-15', '11-15',
          [L('Underlag från team', 'Input from teams'), L('Sammanställ budget', 'Compile budget'), L('Skicka på remiss', 'Send for review')], { [p]: [0, 1, 2] }),
        task('e8', L('Remiss', 'Budget review'), ['it', 'ek', 'hr'], '11-20', '01-15',
          [L('Samla in synpunkter', 'Collect feedback'), L('Fastställ budget', 'Approve budget')], { [p - 1]: [0, 1] }, L('Går över årsskiftet.', 'Crosses New Year.')),
        task('e9', L('Julavslutning', 'Holiday party'), ['hr'], '12-14', '12-18', [L('Boka lokal', 'Book venue')], {}),
      ],
      periods: [
        { id: 'p1', name: L('Sommarsemester', 'Summer holiday'), start: '07-06', end: '08-02', year: null },
        { id: 'p2', name: L('Jullov', 'Christmas break'), start: '12-21', end: '01-06', year: null },
        { id: 'p3', name: L('Sportlov', 'Half-term'), start: '02-23', end: '03-01', year: y },
      ],
    },
    {
      format: FORMAT, id: 'exempel-hemma', example: true, name: L('Exempel: Hemma', 'Example: Home'),
      units: { hus: { name: L('Huset', 'House'), color: '#ea580c' }, bil: { name: L('Bilen', 'Car'), color: '#16a34a' } },
      tasks: [
        task('h1', L('Deklaration', 'Tax return'), ['hus'], '03-15', '05-02', [L('Kontrollera uppgifter', 'Check details'), L('Skicka in', 'Submit')], { [y]: [0, 1], [p]: [0, 1] }),
        task('h2', L('Sommardäck', 'Summer tyres'), ['bil'], '04-01', '04-30', [], { [y]: [0] }),
        task('h3', L('Besiktning', 'Car inspection'), ['bil'], '06-01', '06-30', [], { [y]: [0], [p]: [0] }),
        task('h4', L('Rensa hängrännor', 'Clean gutters'), ['hus'], '09-20', '10-10', [], {}),
        task('h5', L('Vinterdäck', 'Winter tyres'), ['bil'], '10-15', '11-15',
          [L('Boka tid', 'Book a slot'), L('Kontrollera mönsterdjup', 'Check tread depth')], {}, L('Senast 1 dec vid vinterväglag.', 'By 1 Dec in winter conditions.')),
      ],
      periods: [],
    },
  ];
}
