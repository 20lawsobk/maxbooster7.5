#!/usr/bin/env python3
"""Sophia Agents API CLI. All HTTP calls are executed by curl, not an SDK."""
from __future__ import annotations
import argparse
import json
import os
import shutil
import subprocess
import sys
import uuid
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / 'config' / 'session-base.json'
API_BASE = os.environ.get('SOPHIA_API_BASE', 'https://api.openai.com').rstrip('/')
PROJECT_ID = 'proj_oFzzFFQDxMXQXnTjy5O7jYMX'
REPO = 'https://github.com/20lawsobk/maxbooster7.5'
INITIAL_MESSAGE = (
    'You are Sophia. Target the Max Booster project at ' + REPO + '. '
    'The repository is prepared in /workspace/maxbooster7.5. Work directly in that checkout, not through the Replit Agent. First establish which real repository/filesystem and GitHub tools are connected and confirm repository '
    'identity, working branch, and permission. Do not invent access. Inspect repository structure, code, '
    'tests, deployment configuration, and recent change history. Create an evidence-backed readiness '
    'roadmap, then carry out safe, small patches and verify builds and tests after each change. '
    'Use the saved authenticated GitHub MCP tools to open a feature branch and PR; do not assume git push authentication. Never assert completion without actual logs and diff evidence; if access is missing, report the '
    'specific missing connection instead of claiming code changes.'
)

class ApiError(RuntimeError):
    pass


def config():
    cfg = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
    # Deliberately do not override tools or multi_agent: keep all other saved fields.
    assert set(cfg['agent']) == {'model', 'instructions', 'reasoning', 'text'}
    return cfg


def payload(text):
    cfg = config()
    return {**cfg, 'input': [{'role': 'user', 'content': [{'type': 'input_text', 'text': text}]}], 'stream': True}


def headers():
    key = os.environ.get('OPENAI_API_KEY')
    if not key:
        raise ApiError('OPENAI_API_KEY is not set; configure a project-authorized API key in the shell or secret manager.')
    return ['-H', 'Authorization: Bearer ' + key, '-H', 'OpenAI-Beta: agents=v1',
            '-H', 'OpenAI-Project: ' + PROJECT_ID]


def curl_args(method, path, json_body=None, *, streaming=False, include_headers=False, idempotency=None):
    if not shutil.which('curl'):
        raise ApiError('curl is required and was not found in PATH')
    args = ['curl', '--silent', '--show-error', '--fail-with-body', '--connect-timeout', '20']
    if streaming:
        args += ['--no-buffer', '--max-time', '0', '-H', 'Accept: text/event-stream']
    else:
        args += ['--max-time', '120']
    if include_headers:
        args += ['--include']
    args += ['-X', method, *headers()]
    if idempotency:
        args += ['-H', 'Idempotency-Key: ' + idempotency]
    if json_body is not None:
        args += ['-H', 'Content-Type: application/json', '--data-binary', '@-']
    args += [API_BASE + path]
    return args


def request(method, path, data=None, idempotency=None):
    args = curl_args(method, path, data, idempotency=idempotency)
    body = None if data is None else json.dumps(data, ensure_ascii=False).encode('utf-8')
    result = subprocess.run(args, input=body, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        msg = result.stdout.decode(errors='replace').strip() or result.stderr.decode(errors='replace').strip()
        raise ApiError(f'HTTP request failed (curl exit {result.returncode}): {msg[:1200]}')
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise ApiError(f'Invalid JSON response: {result.stdout[:300]!r}') from exc


def retrieve(sid):
    return request('GET', f'/v1/agents/sessions/{quote(sid, safe="")}')


def tool_result(action):
    name = action.get('name')
    if name == 'begin_prod_hardening_for_max_booster':
        # The user's placeholder schema is NOT an implementation. Do not claim execution.
        return {'success': False, 'error': (
            'begin_prod_hardening_for_max_booster is a placeholder and has no configured executor. '
            'Use actual OpenAI-hosted shell/GitHub MCP tools to inspect and patch Max Booster, '
            'or replace the placeholder with an implemented function handler and strict parameters.'
        )}
    return {'success': False, 'error': f'Unsupported local function {name!r}: no handler installed.'}


def resolve_actions(sid, seen):
    session = retrieve(sid)
    actions = session.get('required_actions') or []
    if isinstance(actions, dict):
        actions = actions.get('actions', [])
    if not actions:
        return False
    pending = []
    blocked = False
    for action in actions:
        if action.get('type') != 'function_call':
            print(f'[action] Manual setup required: {action.get("type")} {action}', file=sys.stderr)
            blocked = True
            continue
        call_id = action.get('call_id')
        turn_id = action.get('turn_id')
        if not call_id or not turn_id:
            print('[action] Cannot submit function result: turn_id/call_id missing', file=sys.stderr)
            blocked = True
            continue
        if (turn_id, call_id) in seen:
            continue
        result = tool_result(action)
        pending.append({'type':'agent.session.input.tool_result', 'turn_id':turn_id,
                        'call_id':call_id, **result})
    if pending:
        # One unique key per distinct result submission. No automatic ambiguous retries.
        request('POST', f'/v1/agents/sessions/{quote(sid, safe="")}/events',
                {'events': pending}, idempotency='sophia-' + uuid.uuid4().hex)
        for item in pending:
            seen.add((item['turn_id'], item['call_id']))
            print(f'[tool] {item["call_id"]}: {"ok" if item["success"] else "error sent to agent"}', flush=True)
    return blocked


def chunks(lines):
    """Parse SSE frames; compatible with curl streaming output."""
    data = []
    event_name = None
    for raw in lines:
        line = raw.decode('utf-8', errors='replace') if isinstance(raw, bytes) else raw
        line = line.rstrip('\r\n')
        if not line:
            if data:
                raw_data='\n'.join(data)
                try:
                    yield json.loads(raw_data)
                except json.JSONDecodeError:
                    yield {'type':event_name or 'unparsed', 'raw':raw_data}
            data=[]
            event_name=None
        elif line.startswith('data:'):
            data.append(line[5:].lstrip(' '))
        elif line.startswith('event:'):
            event_name=line[6:].lstrip(' ')
    if data:
        raw_data='\n'.join(data)
        try:
            yield json.loads(raw_data)
        except json.JSONDecodeError:
            yield {'type':event_name or 'unparsed', 'raw':raw_data}


def event_sid(event):
    for key in ('session_id', 'id'):
        val=event.get(key)
        if isinstance(val,str) and val.startswith('sess_'):
            return val
    val=event.get('session')
    if isinstance(val,dict):
        for key in ('id','session_id'):
            sid=val.get(key)
            if isinstance(sid,str) and sid.startswith('sess_'):
                return sid
    return None


def show_event(event, raw=False):
    typ=event.get('type') or 'event'
    if raw:
        print(json.dumps(event,ensure_ascii=False),flush=True)
        return
    if typ in ('agent.session.output_text.delta','agent.session.text.delta'):
        print(event.get('delta') or event.get('text') or '',end='',flush=True)
    else:
        detail=''
        if typ == 'agent.session.turn.completed':
            detail='root turn complete' if not (event.get('turn') or {}).get('subagent_id') else 'subagent complete'
        elif typ == 'agent.session.requires_action':
            detail='function/tool input needed'
        elif typ.endswith('failed') or typ=='error':
            detail=str(event.get('error') or (event.get('turn') or {}).get('error') or '')[:400]
        print(f'\n[{typ}] {detail}',flush=True)


def run_stream(proc, *, raw=False, sid=None, after_connected=None):
    seen=set()
    completed=False
    blocked=False
    try:
        if after_connected:
            # --include prints HTTP response headers before any SSE frame.
            status=None
            for line in proc.stdout:
                stripped=line.decode('utf-8', errors='replace').strip()
                if stripped.startswith('HTTP/'):
                    status=stripped
                if not stripped:
                    if status and not (' 200 ' in status or ' 201 ' in status):
                        raise ApiError(f'Unable to subscribe to event stream: {status}')
                    break
            after_connected()
        for event in chunks(proc.stdout):
            if not isinstance(event,dict):
                continue
            sid = event_sid(event) or sid
            if sid:
                os.environ['SOPHIA_LAST_SESSION_ID']=sid
            show_event(event, raw)
            typ = event.get('type') or ''
            if typ=='agent.session.requires_action':
                if sid:
                    blocked = resolve_actions(sid, seen)
                    if blocked:
                        raise ApiError(f'Session {sid} needs manual environment connection or other action; run status.')
            if typ in ('agent.session.failed','agent.session.environment.failed','error'):
                raise ApiError(f'Session failed: {event.get("error") or typ}')
            if typ in ('agent.session.turn.failed','agent.session.turn.cancelled') and not (event.get('turn') or {}).get('subagent_id'):
                raise ApiError(f'Root turn failed/cancelled: {event.get("turn")}')
            if typ=='agent.session.turn.completed' and not (event.get('turn') or {}).get('subagent_id'):
                completed=True
                break
        if sid:
            print(f'\nSession ID: {sid}', flush=True)
        if not completed:
            if sid:
                state=retrieve(sid)
                if state.get('status')=='requires_action':
                    resolve_actions(sid, seen)
                print(f'Stream closed before root completion. Inspect with: ./sophia.sh status {sid}',file=sys.stderr)
            raise ApiError('No verified root-turn completion event received.')
    finally:
        if proc.poll() is None:
            proc.terminate()
        try:
            proc.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.communicate()
    return sid


def start(message, raw):
    body=payload(message)
    args=curl_args('POST','/v1/agents/sessions',body,streaming=True)
    proc=subprocess.Popen(args,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
    proc.stdin.write(json.dumps(body,ensure_ascii=False).encode())
    proc.stdin.close()
    # communicate() after closing stdin would try flushing; avoid that.
    proc.stdin=None
    return run_stream(proc,raw=raw)


def watch_or_follow(sid, message, raw):
    if not sid.startswith('sess_'):
        raise ApiError('Expected an Agents API session ID starting with sess_')
    path=f'/v1/agents/sessions/{quote(sid,safe="")}/events'
    args=curl_args('GET',path+'?stream=true',streaming=True,include_headers=message is not None)
    proc=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0)
    def send():
        request('POST',path,{'events':[{'type':'agent.session.input.message','input':[
            {'role':'user','content':[{'type':'input_text','text':message}]}
        ]}]},idempotency='sophia-'+uuid.uuid4().hex)
        print('[input] Follow-up submitted',flush=True)
    return run_stream(proc,sid=sid,raw=raw,after_connected=send if message is not None else None)


def main(argv=None):
    parser=argparse.ArgumentParser(description='Sophia OpenAI Agents API session runner (curl transport)')
    parser.add_argument('--events-json',action='store_true',help='Print complete JSON events')
    sub=parser.add_subparsers(dest='command',required=True)
    p=sub.add_parser('start',help='Create an OpenAI-hosted Sophia session with current overrides')
    p.add_argument('message',nargs='?',default=INITIAL_MESSAGE)
    sub.add_parser('dry-run',help='Inspect request payload without contacting API or revealing credentials')
    p=sub.add_parser('follow',help='Send a message to an existing session and stream')
    p.add_argument('session_id');p.add_argument('message')
    p=sub.add_parser('watch',help='Subscribe to an active session')
    p.add_argument('session_id')
    p=sub.add_parser('status',help='Retrieve session status, pending actions and environment')
    p.add_argument('session_id')
    sub.add_parser('doctor',help='Check curl, config and credentials')
    args=parser.parse_args(argv)
    if args.command=='doctor':
        print('Python:',sys.version.split()[0]); print('curl:',shutil.which('curl') or 'MISSING')
        print('API key:', 'configured' if os.getenv('OPENAI_API_KEY') else 'MISSING')
        print('Project:',PROJECT_ID,'\nAgent:',config()['agent_id'])
        print('Payload: valid JSON; tools and multi_agent inherited from saved agent')
        return 0 if shutil.which('curl') and os.getenv('OPENAI_API_KEY') else 2
    if args.command=='dry-run':
        print(json.dumps(payload(INITIAL_MESSAGE),indent=2,ensure_ascii=False));return 0
    if args.command=='start': start(args.message,args.events_json)
    elif args.command=='follow': watch_or_follow(args.session_id,args.message,args.events_json)
    elif args.command=='watch':watch_or_follow(args.session_id,None,args.events_json)
    elif args.command=='status': print(json.dumps(retrieve(args.session_id),indent=2,ensure_ascii=False))
    return 0

if __name__=='__main__':
    try:
        sys.exit(main())
    except (ApiError,OSError,KeyboardInterrupt) as exc:
        print('\nSophia error:',exc,file=sys.stderr)
        sys.exit(1)
