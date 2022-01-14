const pipeline = require('./routes/pipeline')
const vacay = require('./routes/vacay')
const slack = require('./routes/slack')
const notes = require('./routes/notes')
const bday = require('./routes/bday')
const release = require('./routes/release')


module.exports.routes = {
  pipeline,
  vacay,
  slack,
  notes,
  bday,
  release,
}

module.exports.commands = {
  diff: require('./commands/diff'),
  food: require('./commands/food'),
  demo: require('./commands/demo'), // TODO: needs work on the view handler
}
