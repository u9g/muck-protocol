const { parse, compile } = require('protodef-yaml/compiler')
const { join } = require('path')
const fs = require('fs')
const { ProtoDefCompiler } = require('protodef').Compiler

function makeSide (fileName, outPath, ymlPath) {
  const madeTypes = Object.keys(parse(join(ymlPath, 'types.yml'))).map(o => o.match(/%container,(.+),/)).filter(o => o).map(o => o[1])
  const parsed = parse(join(ymlPath, fileName))

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

  const comped = compileThis(join(ymlPath, fileName))
  const compedTypes = compileThis(join(ymlPath, 'types.yml'))

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
  const outProtocol = join(ymlPath, fileName).replace('yml', 'json')
  fs.writeFileSync(outProtocol, JSON.stringify(toRet, null, 2))
  createProtocol(outProtocol, outPath)
}

// Compile the ProtoDef JSON into JS
function createProtocol (fileName, outPath) {
  const compiler = new ProtoDefCompiler()
  const protocol = JSON.parse(fs.readFileSync(fileName, 'utf-8')).types
  compiler.addTypesToCompile(protocol)

  fs.writeFileSync(join(outPath, 'read.js'), 'module.exports = ' + compiler.readCompiler.generate().replace('() =>', 'native =>'))
  fs.writeFileSync(join(outPath, 'write.js'), 'module.exports = ' + compiler.writeCompiler.generate().replace('() =>', 'native =>'))
  fs.writeFileSync(join(outPath, 'size.js'), 'module.exports = ' + compiler.sizeOfCompiler.generate().replace('() =>', 'native =>'))

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

function main () {
  const folderPath = join('data', 'latest')
  for (const side of ['ToServer', 'ToClient']) {
    const sideFolderPath = join(folderPath, side)
    try { fs.mkdirSync(sideFolderPath) } catch (err) {}
    makeSide(`proto${side}.yml`, sideFolderPath, folderPath)
  }
}
main()
