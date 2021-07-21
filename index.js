const { parse, compile } = require('protodef-yaml/compiler')
const { ProtoDefCompiler } = require('protodef').Compiler
const fs = require('fs')
const FILE_NAME = './protoToServer.yml'
const TYPES_FILE_NAME = './types.yml'

function start () {
  const madeTypes = Object.keys(parse(TYPES_FILE_NAME)).map(o => o.match(/%container,(.+),/)).filter(o => o).map(o => o[1])
  const parsed = parse(FILE_NAME)

  const typesUsed = [...new Set(Object.entries(parsed)
    .filter(r => !r[0].startsWith('!'))
    .map(packet => Object.entries(packet[1]))
    .flat(1)
    .filter(o => !o[0].startsWith('!'))
    .map(o => o[1])
    .filter(o => typeof o === 'string'))]
    .filter(o => !madeTypes.includes(o))
    .reduce((acc, curr) => {
      acc[curr] = 'native'
      return acc
    }, {})

  const packetIds = Object.entries(parsed)
    .filter(r => !r[0].startsWith('!'))
    .map(o => {
      const name = o[0].match(/%container,packet_(.+),/)[1]
      const id = o[1]['!id']
      return { name, id }
    }).reduce((acc, curr) => {
      acc[curr.id] = curr.name
      return acc
    }, {})

  const params = Object.entries(parsed)
    .filter(r => !r[0].startsWith('!'))
    .map(o => o[0].match(/%container,packet_(.+),/)[1])
    .reduce((acc, curr) => {
      acc[curr] = `packet_${curr}`
      return acc
    }, {})

  const comped = compileThis(FILE_NAME)
  const compedTypes = compileThis(TYPES_FILE_NAME)

  const toRet = {
    types: {
      ...typesUsed,
      ...compedTypes,
      muck_packet: ['container',
        [{ name: 'name', type: ['mapper', { type: 'varint', mappings: packetIds }] }],
        [{ name: 'params', type: ['switch', { compareTo: 'name', fields: params }] }]],
      ...comped
    }
  }
  fs.writeFileSync(FILE_NAME.replace('yml', 'json'), JSON.stringify(toRet, null, 2))
  createProtocol()
}

// Compile the ProtoDef JSON into JS
function createProtocol () {
  const compiler = new ProtoDefCompiler()
  const protocol = JSON.parse(fs.readFileSync(FILE_NAME.replace('yml', 'json'), 'utf-8')).types
  compiler.addTypesToCompile(protocol)

  fs.writeFileSync('./read.js', 'module.exports = ' + compiler.readCompiler.generate().replace('() =>', 'native =>'))
  fs.writeFileSync('./write.js', 'module.exports = ' + compiler.writeCompiler.generate().replace('() =>', 'native =>'))
  fs.writeFileSync('./size.js', 'module.exports = ' + compiler.sizeOfCompiler.generate().replace('() =>', 'native =>'))

  const compiledProto = compiler.compileProtoDefSync()
  return compiledProto
}

function compileThis (fileName) {
  const tempFileName = './out.json'
  compile(fileName, tempFileName)
  const data = JSON.parse(fs.readFileSync(tempFileName, 'utf-8'))
  fs.rmSync(tempFileName)
  return data
}

start()
