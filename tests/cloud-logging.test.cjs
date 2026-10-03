const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
test('logging preflight uses VM credentials and sends a scoped diagnostic entry', () => {
  execFileSync('python3', ['-c', String.raw`
import importlib.util, io, json, sys
spec = importlib.util.spec_from_file_location('check', sys.argv[1])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
calls = []
values = ['test-project', '123', 'projects/123/zones/europe-west1-b', '{"access_token":"private-token"}', '{}']
def fake(request, timeout):
    calls.append(request)
    assert timeout <= 15
    return io.BytesIO(values[len(calls)-1].encode())
module.check(fake)
assert len(calls) == 5
for request in calls[:4]:
    assert request.get_header('Metadata-flavor') == 'Google'
request = calls[-1]
assert request.full_url == 'https://logging.googleapis.com/v2/entries:write'
assert request.get_header('Authorization') == 'Bearer private-token'
payload = json.loads(request.data)
assert payload['resource']['labels'] == {'project_id':'test-project','instance_id':'123','zone':'europe-west1-b'}
assert 'private-token' not in request.data.decode()
assert payload['logName'] == 'projects/test-project/logs/kwonserver-deployment'
`, path.join(__dirname, '../deploy/compute/check-cloud-logging.py')], {stdio:'pipe'});
});
