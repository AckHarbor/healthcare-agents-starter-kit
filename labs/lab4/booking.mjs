// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Lab 4 "Book it" - complete the TODOs, then run: node checks/check-m4.mjs
// Build the core booking pieces yourself, then run the check: it books on your local Demo EMR and races two bookings at the same moment.
const TODO = m => { const e = new Error(m); e.code = 'TODO'; throw e; };
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

// Turn the "when" part of a request into a search window { from: Date, to: Date } in local time.
//   'today' -> today; 'tomorrow' -> tomorrow; a weekday name -> the NEXT such day (never today); 'YYYY-MM-DD' -> that date.
//   'morning' -> 00:00 to 12:00 of that day; 'afternoon' -> 12:00 to 23:59; neither -> the whole day (00:00 to 23:59).
//   No day at all -> from now to now + 14 days (soonest available).
// `now` is passed in so the check can test fixed dates. Hint: new Date(y, m, d, h, min) builds a local time.
export function parseWhen(text, now = new Date()){
  TODO('parseWhen');
}

// Given FHIR Slot resources (any order, any status), return only the free ones that start at or after `now`, soonest first.
export function pickSlots(slots, now = new Date()){
  TODO('pickSlots');
}

// Build the ONE transaction Bundle that books `slot` for `appointment`:
//   entry 0: POST Appointment (the appointment resource as given, with slot: [{ reference: 'Slot/<id>' }] added)
//   entry 1: PUT Slot/<id> with status 'busy' and request.ifMatch = 'W/"<slot.meta.versionId>"'
// If someone else booked that slot first, the server answers 412 and the whole bundle is rolled back.
export function bookingBundle(slot, appointment){
  TODO('bookingBundle');
}
