const moment = require('moment-timezone')
const { createMessageAdapter } = require('@slack/interactive-messages')
const { Pool } = require('pg')

const { SLACK_SIGNING_SECRET = '', EQ_TZ = 'America/Toronto' } = process.env

const pool = new Pool()
const interactive = createMessageAdapter(SLACK_SIGNING_SECRET)

const bookBoardroom = async ({ user: { id: slack_user_id }, submission }) => {
  const { room, when, duration } = submission
  // check avail
  if (parseInt(duration) <= 0) {
    return {
      errors: [{
        name: 'duration',
        error: 'Time works best when it is not too much, and not too little',
      }]
    }
  }
  const start = moment.tz(when, EQ_TZ)
  const now = moment()
  if (now.isAfter(start)) {
    return { errors: [{ name: 'when', error: 'Plan for the future, instead of the past.' }] }
  }
  const end = moment(start).add(duration, 'minutes')
  const { rows = [] } = await pool.query({
    name: 'list-bookings',
    text: `
      SELECT *
      FROM boardroom
      WHERE room = $1
        AND $2 <= "end"
        AND $3 >= start;
    `,
    values: [room, start.toISOString(), end.toISOString()],
  })
  if (rows.length) {
    return {
      errors: [
        { name: 'when', error: 'This period is blocked by existing bookings.' },
        { name: 'duration', error: 'This period is blocked by existing bookings.' },
      ],
    }
  }
  const values = [room, slack_user_id, start.toISOString(), end.toISOString()]
  const { rows: [{ id }] = [] } = await pool.query({
    text: `
      INSERT INTO boardroom (room, slack_user_id, start, "end")
      VALUES (${values.map((_, i) => `$${i + 1}`)})
      RETURNING id;
    `,
    values,
  })
  return {
    response_type: 'in_channel',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `\`${room}\` boardroom booked by <@${slack_user_id}>`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'plain_text',
            text: `From: ${start.format('lll z')}`,
          },
          {
            type: 'plain_text',
            text: `To: ${end.format('lll z')}`,
          },
        ]
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Booking: \`${id}\``,
          }
        ]
      },
    ],
  }
}

const createWhiteLabel = () => {}

const actions = {
  'boardroom.book': bookBoardroom,
  'whitelabel.create': createWhiteLabel,
}

interactive.action({ type: 'dialog_submission' }, async (payload, respond) => {
  const { state } = payload
  try {
    const r = await actions[state](payload)
    if (r.errors) {
      return r
    }
    respond(r)
    return
  } catch (e) {
    respond({ text: e.message, response_type: 'ephemeral' })
    return
  }
})

module.exports = interactive
