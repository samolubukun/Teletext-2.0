// 20 evaluation sources. All people, numbers and places are fake.
import type { EvalCase } from "./eval";

export const EVAL_CASES: readonly EvalCase[] = [
  {
    id: "school-reports",
    source: `Dear parents,
Term 1 reports for JSS3 will be ready on Friday 13 November 2026.
Collect them in the Main Hall between 9am and 3pm. Bring your child's ID card.
Outstanding fees of N2,500 must be cleared first.
Call the office on 0800 000 0000.
Mrs Adaeze Okafor, Principal`,
    mustKeep: ["13 November 2026", "9am", "3pm", "N2,500", "0800 000 0000", "Adaeze Okafor"],
    phrases: ["9am (to|-) ?3pm"],
  },
  {
    id: "clinic-vaccine",
    source: `Lakeside Clinic will hold a free measles vaccine day on Sat 21 Nov. Doors open at 08:30 and close at 13:00. Children aged 9 months to 5 years are welcome. Bring the child's health card. Questions: 0800 000 0111.`,
    mustKeep: ["21 Nov", "08:30", "13:00", "0800 000 0111"],
    // A range stays a range: "9 months to 5 years" or "between 9 months and 5 years". "9 months and 5 years" alone would read as two ages.
    phrases: ["(9 months (to|-) ?5 years|between 9 months and 5 years)", "health card"],
  },
  {
    id: "bus-delay",
    source: `Route 12 buses between Central Park and Harbour Road are delayed by 25 minutes today because of road works on Ring Road. Route 14 is not affected. Normal service should resume on Mon 16 Nov at 6am.`,
    mustKeep: ["25 minutes", "Mon 16 Nov", "6am"],
    phrases: ["Route 12", "Route 14"],
  },
  {
    id: "exam-timetable",
    source: `Mathematics: Mon 23 Nov, 9:00 to 11:00.
English: Tue 24 Nov, 9:00 to 11:30.
Biology: Thu 26 Nov, 13:00 to 15:00.
Candidates must arrive 30 minutes early.`,
    mustKeep: ["23 Nov", "24 Nov", "26 Nov", "11:30", "13:00", "30 minutes"],
    phrases: ["arrive 30 minutes early|30 minutes early"],
  },
  {
    id: "market-prices",
    source: `Market prices this week: rice per bag N48,000, beans per bag N52,500, garri per bag N19,000. Prices are for Wed 18 Nov and may change on Friday.`,
    mustKeep: ["N48,000", "N52,500", "N19,000", "18 Nov"],
  },
  {
    id: "closure-notice",
    source: `The council office on Elm Street will be closed on Fri 27 Nov for staff training. It reopens on Mon 30 Nov at 8am. For urgent matters call 0800 000 0222.`,
    mustKeep: ["27 Nov", "30 Nov", "8am", "0800 000 0222"],
    phrases: ["closed"],
  },
  {
    id: "event-fair",
    source: `Greenfield Science Fair. Sat 5 Dec, 10am to 4pm, Sports Hall. Entry is free for students and N500 for adults. Prizes for the top 3 projects.`,
    mustKeep: ["5 Dec", "10am", "4pm", "N500", "top 3"],
    phrases: ["10am (to|-) ?4pm"],
  },
  {
    id: "condition-id",
    source: `Reports cannot be released without a valid ID card. If you have lost the card, visit the registry on Tue 17 Nov between 10am and 12pm with a passport photo.`,
    mustKeep: ["17 Nov", "10am", "12pm"],
    phrases: ["without (a valid )?ID", "10am (to|-) ?12pm"],
  },
  {
    id: "percent-discount",
    source: `Fees paid before Fri 20 Nov get a 10% discount. Fees paid after Fri 4 Dec carry a 15% late charge. Total fee per student is N30,000.`,
    mustKeep: ["20 Nov", "10%", "4 Dec", "15%", "N30,000"],
    phrases: ["before", "after"],
  },
  {
    id: "water-outage",
    source: `Water supply in Zone B will be off from 22:00 on Sun 22 Nov until 06:00 on Mon 23 Nov while pipes are repaired. Tankers will stand at Gate 3.`,
    mustKeep: ["22:00", "22 Nov", "06:00", "23 Nov", "Gate 3"],
  },
  {
    id: "no-numbers",
    source: `Please keep the library quiet. Eating is not allowed at the study desks. Return all books to the front desk before you leave.`,
    mustKeep: [],
    phrases: ["quiet", "books"],
  },
  {
    id: "long-newsletter",
    source: `Greenfield High newsletter. We are proud of our football team, which won 3 of 4 matches this term. Mr Tunde Bello coached the team. The debate club meets every Wed at 14:30 in Room 6. The school choir sings at the carol service on Thu 17 Dec at 17:00. Parents are asked to pay the N1,200 activity levy by Fri 11 Dec. The tuck shop will close early on Fri 11 Dec at 13:00. Please read the full handbook on our notice board.`,
    mustKeep: ["3 of 4", "Tunde Bello", "14:30", "Room 6", "17 Dec", "17:00", "N1,200", "11 Dec", "13:00"],
  },
  {
    id: "scholarship",
    source: `Applications for the Adeyemi Scholarship close on Fri 8 Jan 2027. Students must have an average score of at least 70 percent. Forms are free from the registry. Send questions to Ms Ngozi Eze on 0800 000 0333.`,
    mustKeep: ["8 Jan 2027", "70 percent", "Ngozi Eze", "0800 000 0333"],
    phrases: ["at least 70"],
  },
  {
    id: "queue-times",
    source: `Queue times at Central Clinic today: Reception 10 minutes, Pharmacy 35 minutes, Laboratory 20 minutes. Last updated 11:40.`,
    mustKeep: ["10 minutes", "35 minutes", "20 minutes", "11:40"],
  },
  {
    id: "dotted-time",
    source: `The assembly starts at 8.30 a.m. on Mon 9 Nov and ends at 9 a.m. Late students must sign the book at the gate.`,
    mustKeep: ["8.30 a.m.", "9 Nov", "9 a.m."],
    phrases: ["sign"],
  },
  {
    id: "dates-numeric",
    source: `Registration runs from 02/11/2026 to 13/11/2026. A late fee of N1,000 applies after 13/11/2026.`,
    mustKeep: ["02/11/2026", "13/11/2026", "N1,000"],
    phrases: ["late fee"],
  },
  {
    id: "two-contacts",
    source: `For fees call Mr Chidi Obi on 0800 000 0444. For transport call Mrs Funke Ade on 0800 000 0555. Offices are open Mon to Fri, 8am to 4pm.`,
    mustKeep: ["Chidi Obi", "0800 000 0444", "Funke Ade", "0800 000 0555", "8am", "4pm"],
    phrases: ["Mon(day)? (to|-) ?Fri(day)?"],
  },
  {
    id: "exception",
    source: `All pupils must wear uniform from Mon 2 Nov, except on Fri 6 Nov when they may wear sports kit. Pupils without uniform will be sent home by 10am.`,
    mustKeep: ["2 Nov", "6 Nov", "10am"],
    phrases: ["except|but"],
  },
  {
    id: "numeric-range",
    source: `Pupils in Year 4 will be taught in Room 9 from 10 to 12 on Wed 25 Nov. Each pupil needs 2 pencils and a ruler. Parents may watch from the gallery.`,
    mustKeep: ["Room 9", "25 Nov", "2 pencils"],
    phrases: ["10 (to|-) ?12"],
  },
  {
    id: "marketing-noise",
    source: `We are SO excited to announce our amazing, world-class Open Day!!! Come and see why parents love us. Sat 28 Nov, 11am to 2pm. Free lunch for the first 100 visitors. Don't miss out!`,
    mustKeep: ["28 Nov", "11am", "2pm", "100"],
    phrases: ["11am (to|-) ?2pm"],
  },
];
