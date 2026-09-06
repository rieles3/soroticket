import SwaggerParser from '@apidevtools/swagger-parser';
import {readFile} from 'node:fs/promises';
const spec=await SwaggerParser.validate('docs/api/openapi.json');
const routes=await readFile('cloud/api/main.go','utf8');
for(const [path,methods]of Object.entries(spec.paths))for(const method of Object.keys(methods)){
 if(!routes.includes(`"${method.toUpperCase()} ${path}"`))throw new Error(`OpenAPI route missing from server: ${method} ${path}`);
}
console.log(`Valid OpenAPI: ${Object.keys(spec.paths).length} implemented paths`);
