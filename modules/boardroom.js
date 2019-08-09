const express = require('express')
const moment = require('moment-timezone')
const { Pool } = require('pg')
const { WebClient } = require('@slack/web-api')
const shortid = require('shortid')

const pool = new Pool()
const router = express.Router()

const { SLACK_BOT_TOKEN, EQ_TZ = 'America/Toronto' } = process.env
const web = new WebClient(SLACK_BOT_TOKEN)

router.all('/', async (req, res, next) => {
  const { text, trigger_id, user_id } = req.body
  const now = moment().tz(EQ_TZ)
  const [command, ...params] = text.trim().toLowerCase().split(/\s+/)
  try {
    if (command === 'book') {
      const callback_id = shortid.generate()
      const dialog = {
        callback_id,
        title: 'Book a Boardroom',
        submit_label: 'Request',
        state: 'boardroom.book', // this corresponds to actions ^
        elements: [
          {
            label: 'Room',
            type: 'select',
            name: 'room',
            options: [
              { label: 'Large', value: 'large' },
              { label: 'Small', value: 'small' },
            ],
          },
          {
            label: 'When (YYYY-MM-DD HH:mm)',
            name: 'when',
            type: 'text',
            placeholder: `In the form of [${now.format('YYYY-MM-DD HH:mm')}]`,
          },
          {
            label: 'Duration (minutes)',
            name: 'duration',
            type: 'text',
            subtype: 'number',
            placeholder: 'In minutes',
          },
        ],
      }
      await web.dialog.open({ dialog, trigger_id })
      return res.sendStatus(204)
    } else if (command === 'cancel') {
      const id = parseInt(params[0])
      if (Number.isNaN(id)) {
        return res.status(200).json({
          response_type: 'ephemeral',
          blocks: [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Invalid ID*'
            },
          }],
        })
      }
      const { rowCount } = await pool.query({
        text: `
          DELETE FROM boardroom
          WHERE id = $1
            AND slack_user_id = $2;
        `,
        values: [id, user_id],
      })
      if (!rowCount) {
        return res.status(200).json({
          response_type: 'ephemeral',
          blocks: [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                '*You have no power here*',
                `Booking \`${id}\` doesn't exist or doesn't belong to you`,
              ].join('\n'),
            },
          }],
        })
      }
      return res.status(200).json({
        response_type: 'ephemeral',
        blocks: [{
          type: 'section',
          text: { type: 'mrkdwn', text: `*Booking \`${id}\` cancelled*` },
        }],
      })
    } else {
      const [room, my] = params
      const query = {
        text: `
          SELECT id, room, slack_user_id, start::TEXT, "end"::TEXT
          FROM boardroom
          WHERE start >= now()
        `,
        values: [],
      }
      if (room) {
        query.values.push(room)
        query.text = `${query.text} AND room = $${query.values.length}`
      }
      if (my) {
        query.values.push(user_id)
        query.text = `${query.text} AND slack_user_id = $${query.values.length}`
      }
      query.text = `${query.text} ORDER BY start ASC LIMIT 10`
      const { rows = [] } = await pool.query(query)
      if (!rows.length) {
        return res.status(200).json({
          response_type: 'ephemeral',
          blocks: [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*No upcoming schedules found*'
            },
          }],
        })
      }
      const schedules = []
      rows.forEach(({ id, room, slack_user_id, start, end }) => {
        // TODO: add accessoary button to cancel requester's own
        schedules.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: [start, end].map(ts => moment.utc(ts).tz(EQ_TZ).format('lll z')).join(' - '),
          },
        })
        const ctx = {
          type: 'context',
          elements: [
            { type: 'mrkdwn', text: `\`${room}\` boardroom` },
            { type: 'mrkdwn', text: `by <@${slack_user_id}>` },
          ],
        }
        if (slack_user_id === user_id) {
          ctx.elements.push({ type: 'mrkdwn', text: `ID: \`${id}\`` })
        }
        schedules.push(ctx)
      })
      return res.status(200).json({
        response_type: 'ephemeral',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${rows.length} upcoming schedule${rows.length > 1 ? 's' : ''} found*`
            },
          },
          { type: 'divider' },
          ...schedules,
          { type: 'divider' },
          {
            type: 'context',
            elements: [
              {
                type: 'plain_text',
                text: now.format('lll z'),
              }
            ],
          },
        ],
      })
    }
  } catch (err) {
    return next(err)
  }
})

module.exports = router
