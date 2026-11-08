"""Use the repository's official Adaption Python client from the TS runner."""
import json
import sys
from adaption import Adaption

request = json.load(sys.stdin)
response = Adaption(max_retries=0, timeout=90).responses.create(
    model=request['model'], instructions=request['instructions'],
    input=json.dumps(request['observation']), max_output_tokens=300,
    temperature=0, tool_choice='none', store=False,
)
if response.status != 'completed' or not response.output_text:
    raise RuntimeError('Adaption response was not completed')
print(json.dumps(json.loads(response.output_text)))
