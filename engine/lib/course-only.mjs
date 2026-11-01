// Copyright 2026 DaRider Tech LLC
// SPDX-License-Identifier: Apache-2.0
// Parts of the AckHarbor(TM) engine that learners build in the AckHarbor(TM) Healthcare Agents Course are not in this free kit.
// They fail with one clear message instead of a stack trace.
export const COURSE_URL = 'https://ackharbor.com/healthcare-agents/';
export class CourseOnly extends Error {
  constructor(what, where){ super(`${what} is not in the free starter kit. You build it in ${where} of the AckHarbor(TM) Healthcare Agents Course: ${COURSE_URL}`); this.code = 'COURSE_ONLY'; }
}
export const courseOnly = (what, where) => { throw new CourseOnly(what, where); };
// For agents: a normal "not ok" result the CLI prints as one line.
export const notIncluded = (what, where) => ({ ok: false, courseOnly: true, say: new CourseOnly(what, where).message });
