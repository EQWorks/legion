module.exports._blocks = (ref) => ([
  { type: 'divider' },
  {
    label: {
      'type': 'plain_text',
      'text': 'Select Bday Person :balloon:',
      'emoji': true
    },
    block_id: `bday_person_${ref}`,
    type: 'input',
    element:
    {
      'action_id': 'input',
      'type': 'users_select',
      'placeholder': {
        'type': 'plain_text',
        'text': 'Bday Person',
        emoji: true,
      },
    },
  },
  {
    'type': 'input',
    'block_id': `url_${ref}`,
    'label': {
      'type': 'plain_text',
      'text': 'Miro URL'
    },
    'element': {
      'type': 'plain_text_input',
      'action_id': 'input',
      'placeholder': {
        'type': 'plain_text',
        'text': 'add here your card url'
      }
    }
  },
])

module.exports.customMessage = (ref) => ({
  'type': 'input',
  'block_id': `message_${ref}`,
  'label': {
    'type': 'plain_text',
    'text': 'Bday Message'
  },
  'element': {
    'type': 'plain_text_input',
    'action_id': 'input',
    initial_value: 'Hope you have a wonderful day and eat lots of cake on behalf of all of us! :birthday:',
    'multiline': true
  },
  'hint': {
    'type': 'plain_text',
    'text': 'This is the default message',
  }
})

module.exports.dates = (ref) => ({
  'type': 'input',
  'block_id': `date_${ref}`,
  'label': {
    'type': 'plain_text',
    'text': 'Date'
  },
  'element': {
    'type': 'plain_text_input',
    'action_id': 'input',
    'placeholder': {
      'type': 'plain_text',
      'text': 'add the birthday here'
    }
  }
})

module.exports.button = {
  'type': 'actions',
  'elements': [
    {
      'type': 'button',
      'action_id': 'add',
      'style': 'primary',
      'text': {
        'type': 'plain_text',
        'text': 'Add more'
      },
    },
  ],
  'block_id': 'manage_fields',
}

// to be added inside an actions block
module.exports.removeButton = {
  // 'type': 'actions',
  // 'elements': [
  // {
  'type': 'button',
  'action_id': 'remove',
  'text': {
    'type': 'plain_text',
    'text': 'Remove'
  },
  'style': 'danger'
  //   }
  // ],
  // 'block_id': 'remove',
}

module.exports.signMessage = ([{ fullName, url, date }, ...rest], sender) => {
  let names = fullName
  let namesWithDates = `${fullName}'s (${date})`

  let getClick = (name, url, type = 'text') => {
    const message = `Click :point_right: <${url}|here> :point_left: to sign a card for ${name}!`
    return type === 'text'
      ? message
      : {
        'type': 'section',
        'text': {
          'type': 'mrkdwn',
          'text': message
        }
      }
  }

  let clickSectionText = [getClick(fullName, url)]
  let clickSectionBlock = [getClick(fullName, url, 'block')]
  let allCards = `${url}`

  if (rest.length) {
    for (let { fullName, url, date } of rest) {
      names += ` & ${fullName}`
      namesWithDates += ` & ${fullName}'s (${date})`
      clickSectionText.push(getClick(fullName, url))
      clickSectionBlock.push(getClick(fullName, url, 'block'))
      allCards += `, ${url}`
    }
  }

  const text = [
    `:tada: Birthday Alert for ${names} :tada:`,
    `*${namesWithDates}* birthday is coming up soon! Take some time and leave a nice message for ${names} to read. Thanks! :smile:`,
    ...clickSectionText,
    'Instructions are found inside the card.',
  ].join('\n')

  const blocks = [
    {
      'type': 'header',
      'text': {
        'type': 'plain_text',
        'text': `:tada: Birthday Alert for ${names} :tada:`,
        'emoji': true
      }
    },
    {
      'type': 'section',
      'text': {
        'type': 'mrkdwn',
        'text': `*${namesWithDates}* birthday is coming up soon! Take some time and leave a nice message for ${names} to read. Instructions are found inside the card. Thanks! :smile:`
      }
    },
    ...clickSectionBlock,
    {
      'type': 'context',
      'elements': [
        {
          'type': 'mrkdwn',
          'text': `From <@${sender}> on behalf of EQ`,
        }
      ]
    }
  ]

  const isMultipleCards = (rest.length) ? 'cards have' : 'card has'
  const confirmation = [
    {
      'type': 'header',
      'text': {
        'type': 'plain_text',
        'text': `The ${isMultipleCards} been sent to everyone except ${names} to be signed! :tada:`,
        'emoji': true
      }
    },
    {
      'type': 'section',
      'text': {
        'type': 'mrkdwn',
        'text': 'Thanks for spreading some love! :smile:'
      }
    },
    {
      'type': 'divider'
    },
    {
      'type': 'context',
      'elements': [
        {
          'type': 'mrkdwn',
          'text': `Card link(s): ${allCards}`,
        }
      ]
    }
  ]
  return { text, blocks, confirmation }
}

module.exports.sendText = ({ fullName, url, message, sender }) => ([
  `:tada: Happy Birthday ${fullName}! :tada:`,
  message,
  `Click :point_right: <${url}|here> :point_left: to see the birthday card!`,
  `- From <@${sender}> on behalf of EQ`
].join('\n'))

module.exports.sendBlocks = ({ fullName, url, message, sender }) => ([
  {
    'type': 'header',
    'text': {
      'type': 'plain_text',
      'text': `:tada: Happy Birthday ${fullName}! :tada:`,
      'emoji': true
    }
  },
  {
    'type': 'section',
    'text': {
      'type': 'mrkdwn',
      'text': message
    }
  },
  {
    'type': 'section',
    'text': {
      'type': 'mrkdwn',
      'text': `Click :point_right: <${url}|here> :point_left: to see the birthday card!`
    }
  },
  {
    'type': 'divider'
  },
  {
    'type': 'context',
    'elements': [
      {
        'type': 'mrkdwn',
        'text': `From <@${sender}> on behalf of EQ`,
      }
    ]
  }
])

module.exports.sendConfirmation = ([{ fullName, url }, ...rest]) => {
  let name = fullName
  let allCards = `${url}`
  if (rest.length) {
    for (let { fullName, url } of rest) {
      name += ` & ${fullName}`
      allCards += `, ${url}`
    }
  }
  return [
    {
      'type': 'header',
      'text': {
        'type': 'plain_text',
        'text': `Card has been sent to ${name}! :tada:`,
        'emoji': true
      }
    },
    {
      'type': 'section',
      'text': {
        'type': 'mrkdwn',
        'text': 'Thanks for spreading some love! :smile:'
      }
    },
    {
      'type': 'divider'
    },
    {
      'type': 'context',
      'elements': [
        {
          'type': 'mrkdwn',
          'text': `Card link(s): ${allCards}`,
        }
      ]
    },
  ]
}
module.exports.celebrateBlocks = (BDAY_USER_NAME, renderedText) => ([
  {
    'type': 'header',
    'text': {
      'type': 'plain_text',
      'text': ':tada: Birthday Alert :tada:',
      'emoji': true
    }
  },
  {
    'type': 'section',
    'text': {
      'type': 'mrkdwn',
      'text': `@here It's @${BDAY_USER_NAME}'s birthday today! ${renderedText}`
    }
  },
  {
    'type': 'image',
    'image_url': 'https://media.giphy.com/media/IQF90tVlBIByw/giphy.gif',
    'alt_text': 'minion birthday'
  }
])

module.exports.defaultBlock = [
  { type: 'divider' },
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: 'Oops! Missing some required keywords! Please see the following guide on how to use the */bday* command:'
    },
  },
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: [
        '(1) */bday* sign',
        '(2) */bday* send',
        '(3) */bday* celebrate for @bday-user optional custom message',
      ].join('\n'),
    },
  },
]
