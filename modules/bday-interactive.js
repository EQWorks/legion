module.exports.bdayInteractive = ({ type, values }) => {

  let data = {}
  if (type === 'view_submission') {
    /**
        values = {
          bday_person_1: { input: { type: 'users_select', selected_user: 'U01B87YFQ78' } },
          url_1: { input: { type: 'plain_text_input', value: 'test' } },
          bday_person_2: { input: { type: 'users_select', selected_user: 'U01B87YFQ78' } },
          url_2: { input: { type: 'plain_text_input', value: 'test' } }
          ...
        }
      */
    const errors = {}
    // TODO improve validation
    const validData = (key, input) => {
      if (!input.startsWith('http')) {
        errors[key] = 'Invalid url. Hint: make sure it includes `http`'
      }
    }

    data = Object.entries(values).reduce((acc, [key, { input }]) => {
      // key = bday_person_1 || url_1 || message_1
      const user_index = key.slice(-1)
      if (acc[user_index]) {
        if (key.includes('url')) {
          validData(key, input.value)
          acc[user_index] = { ...acc[user_index], url: input.value }
        }
        if (key.includes('message')) {
          acc[user_index] = { ...acc[user_index], message: input.value }
        }
      } else {
        acc[user_index] = { id: input.selected_user }
      }
      return acc
    }, {})
    /**
     * data {
        '1': { id: 'U01B87YFQ78', url: 'test'},
        '2': { id: 'U01B87ZH3GW', url: 'test', message: 'bday wishes'  },
        ...
      }
     */
    return { errors, data }
  }
  return data
}