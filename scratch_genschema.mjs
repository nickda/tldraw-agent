import { buildResponseSchema } from './shared/schema/buildResponseSchema.ts'
const schema = buildResponseSchema(['create'], 'working')
import { writeFileSync } from 'fs'
writeFileSync('/tmp/actionschema.json', JSON.stringify(schema))
console.log('len', JSON.stringify(schema).length)
