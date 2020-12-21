const { google } = require('googleapis')

const { GOOGLE_CLIENT_ID, GOOGLE_SECRET_KEY, GOOGLE_DEMO_CALENDAR, GOOGLE_REFRESH_TOKEN } = process.env


/*
  https://developers.google.com/calendar/quickstart/nodejs
  https://developers.google.com/calendar/v3/reference/events/list#try-it
*/
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_SECRET_KEY
)

oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })

const isOverlap = (dateToCheck, start, end) => {
  const ts = (dateString) => new Date(dateString).getTime()

  const rangeCompare = ts(dateToCheck) >= ts(start) && ts(dateToCheck) <= ts(end)

  return rangeCompare
}

const dedupeTime = (items) => {
  const deduped = items.reduce((
    acc,
    {
      summary,
      start: { dateTime: startDate },
      end: { dateTime: endDate },
      htmlLink
    },
    i) => {
    const eventKey = `event${i}`
    const  existingEvents = Object.entries(acc || {})
    let replaced = false
    if (existingEvents.length) {
      existingEvents.forEach(([key, { start, end }]) => {
        const s = isOverlap(startDate, start, end)
        const e = isOverlap(endDate, start, end)
        if (!s && !e) {
          replaced = false
          return
        }
        if (s && !e){
          acc[key].end = endDate
        }
        if (!s && e) {
          acc[key].start = startDate
        }
        replaced = true
      })
    }
    if (!replaced){
      acc[eventKey] = {
        start: startDate,
        end: endDate,
        summary,
        htmlLink
      }
    }
    return acc
  }, {})
  return Object.values(deduped).map((range) => {
    range.timeSlot = [
      'between',
      new Date(range.start).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' }),
      'and',
      new Date(range.end).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit' })
    ].join(' ')
    return range
  })
}

/**
 * @function gCalendarGetEvents
 * @param {object} param range dates to fetch events
 * @param {number} param.start start date in milisec. Can be any js Date param
 * @param {number} param.end end date in milisec. Can be any js Date param
 */
module.exports.gCalendarGetEvents = ({
  // default to current day
  start = (new Date()).setHours(0,0,0,0),
  end = (new Date()).setHours(23,59,59,999),
} = {}) => {
  const calendar = google.calendar({
    version: 'v3',
    auth: oauth2Client
  })
  // calendar public link
  const link = 'https://calendar.google.com/calendar/u/0?cid=Y18wZGdoZ3MyNWo3cWplNmFhZmw0NDhybXQxY0Bncm91cC5jYWxlbmRhci5nb29nbGUuY29t'

  return calendar.events.list({
    calendarId: GOOGLE_DEMO_CALENDAR,
    // calendarId: 'primary', // to test with your own calendar
    timeMin: new Date(start).toISOString(), //utc
    timeMax: new Date(end).toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })
    .then(({ data: { items } }) => {
      const events = dedupeTime(items)
      return events.length
        ? { day: new Date(start).toDateString(), link, events }
        : null
    })
    /** items = [
      {
        kind: 'calendar#event',
        etag: '"3214712776458000"',
        id: '1itgg4cctkv3btud9tqntqe5ul_20201221T160000Z',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=MWl0Z2c0Y2N0a3YzYnR1ZDl0cW50cWU1dWxfMjAyMDEyMjFUMTYwMDAwWiB0YW1pcmVzQGVxd29ya3MuY29t',
        created: '2020-01-09T15:38:34.000Z',
        updated: '2020-12-07T15:53:08.229Z',
        summary: 'Weekly Design Connect',
        description: 'A weekly meet up (with Design team) and product team members who are interested to discuss implement and roll out design centric planning and product development.',
        location: 'Toronto-1-Large Board  Room (3)',
        creator: { email: 'do.park@eqworks.com' },
        organizer: { email: 'do.park@eqworks.com' },
        start: {
          dateTime: '2020-12-21T11:00:00-05:00',
          timeZone: 'America/Toronto'
        },
        end: {
          dateTime: '2020-12-21T12:00:00-05:00',
          timeZone: 'America/Toronto'
        },
        recurringEventId: '1itgg4cctkv3btud9tqntqe5ul_R20200914T150000',
        originalStartTime: {
          dateTime: '2020-12-21T11:00:00-05:00',
          timeZone: 'America/Toronto'
        },
        iCalUID: '1itgg4cctkv3btud9tqntqe5ul_R20200914T150000@google.com',
        sequence: 2,
        attendees: [
          [Object], [Object],
          [Object], [Object],
          [Object], [Object],
          [Object], [Object],
          [Object], [Object],
          [Object], [Object],
          [Object]
        ],
        extendedProperties: { shared: [Object] },
        conferenceData: {
          entryPoints: [Array],
          conferenceSolution: [Object],
          conferenceId: '81722919688',
          signature: 'AL9oL6WI1XjFbxNdjcnpxw6hy+nb',
          notes: 'Passcode: 719300',
          parameters: [Object]
        },
        reminders: { useDefault: true }
      }, ... ]
   */
}
