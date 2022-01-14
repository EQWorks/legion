const { gCalendarCreateEvent } = require('../lib/googleapis')

const listener = async ({ ack, command, client }) => {
  await ack()
  const { trigger_id } = command
  await client.views.open({
    // Pass a valid trigger_id within 3 seconds of receiving it
    trigger_id,
    // View payload
    view: {
      'callback_id': 'demo',
      'title': {
        'type': 'plain_text',
        'text': 'Demo Calendar',
      },
      'submit': {
        'type': 'plain_text',
        'text': 'Book',
      },
      'type': 'modal',
      'blocks': [
        {
          'type': 'input',
          'block_id': 'date',
          'element': {
            'type': 'datepicker',
            'placeholder': {
              'type': 'plain_text',
              'text': 'Select a date',
            },
            'action_id': 'datepicker'
          },
          'label': {
            'type': 'plain_text',
            'text': 'Date',
          }
        },
        {
          'type': 'input',
          'block_id': 'startTime',
          'element': {
            'type': 'timepicker',
            'initial_time': '09:30',
            'placeholder': {
              'type': 'plain_text',
              'text': 'Select time',
            },
            'action_id': 'timepicker-start'
          },
          'label': {
            'type': 'plain_text',
            'text': 'Start',
          }
        },
        {
          'type': 'input',
          'block_id': 'endTime',
          'element': {
            'type': 'timepicker',
            'placeholder': {
              'type': 'plain_text',
              'text': 'Select time',
            },
            'action_id': 'timepicker-end'
          },
          'label': {
            'type': 'plain_text',
            'text': 'End',
          }
        }
      ]
    },
  })
}

const viewHandler = async ({ ack, body, view, client, logger }) => {
  logger.info(JSON.stringify({
    view,
    body,
  }, null, 2))
  await ack()
  const {
    state: {
      values: {
        date: { datepicker: { selected_date: date } },
        startTime: { 'timepicker-start': { selected_time: start } },
        endTime: { 'timepicker-end': { selected_time: end } }
      },
    },
  } = view
  const { user: { id: user } } = body
  try {
    const [link] = await gCalendarCreateEvent({ date, start, end })
    await client.chat.postMessage({
      channel: user,
      text: `:money_mouth_face: Event added to the <${link}|Demo calendar>`,
    })
  } catch(err) {
    logger.error(err)
    await client.chat.postMessage({
      channel: user,
      text: ':no_entry_sign: *COULD NOT* save this event.',
    })
  }
}

module.exports = { listener, viewHandler }
