// Scheduled classes. A class with a start time in the future is not open to students yet. The host (and any admin) can
// always enter, to prepare or start early. The interface already shows "Scheduled"; this makes the server agree.
'use strict';

const startsInFuture = (classroom, now = new Date()) => {
  if (!classroom || !classroom.scheduledAt) return false;
  const t = new Date(classroom.scheduledAt).getTime();
  return Number.isFinite(t) && t > now.getTime();
};

// True when this person must wait: the class has a future start time and they are not its host.
const mustWait = (classroom, classRole, now = new Date()) => classRole !== 'HOST' && startsInFuture(classroom, now);

module.exports = { startsInFuture, mustWait };
