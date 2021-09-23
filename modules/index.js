const demo = require('./routes/demo')
const diff = require('./routes/diff')
const food = require('./routes/food')
const pipeline = require('./routes/pipeline')
const avail = require('./routes/avail')
const vacay = require('./routes/vacay')
const slack = require('./routes/slack')
const notes = require('./routes/notes')
const bday = require('./routes/bday')
const release = require('./routes/release')


module.exports.routes = {
  demo,
  diff,
  food,
  pipeline,
  avail,
  vacay,
  slack,
  notes,
  bday,
  release,
}
