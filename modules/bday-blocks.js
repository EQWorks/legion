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

module.exports.signMessage = ([{ fullName, url }, ...rest], sender) => {
  let name = fullName

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
  let allCards = `<${url}>`

  if (rest.length) {
    for (let { fullName, url } of rest) {
      name += ` & ${fullName}`
      clickSectionText.push(getClick(fullName, url))
      clickSectionBlock.push(getClick(fullName, url, 'block'))
      allCards += `, <${url}>`
    }
  }

  const text = [
    `:tada: Birthday Alert for ${name} :tada:`,
    `*${name}'s* birthday is coming up soon! Take some time and leave a nice message for them to read. Thanks! :smile:`,
    ...clickSectionText,
    'Instructions are found inside the card.',
  ].join('\n')

  const blocks = [
    {
      'type': 'header',
      'text': {
        'type': 'plain_text',
        'text': `:tada: Birthday Alert for ${name} :tada:`,
        'emoji': true
      }
    },
    {
      'type': 'section',
      'text': {
        'type': 'mrkdwn',
        'text': `*${name}*'s birthday is coming up soon! Take some time and leave a nice message for them to read. Instructions are found inside the card. Thanks! :smile:`
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

  const confirmation = [
    {
      'type': 'header',
      'text': {
        'type': 'plain_text',
        'text': `The card has been sent to everyone except ${name} to be signed! :tada:`,
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