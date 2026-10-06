#!/usr/bin/env python3
"""Closed GitHub fixture and saved-batch transitions; never proxies gh requests."""

import json
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys
import shutil
import tempfile

URL = 'https://github.com/example/counter/pull/12'
BODY = '# Counter fix\n\n## Unapplied review findings\n- [ ] src/counter.js: increment adds two instead of one\n'


def root():
    for candidate in (Path.cwd(), *Path.cwd().parents):
        if (candidate / '.fake-gh').is_dir():
            return candidate
    raise ValueError('run in a disposable resolver fixture workspace')


def log(tool, request):
    with (root() / '.fake-gh/requests.jsonl').open('a') as target:
        target.write(json.dumps({'tool': tool, 'request': request}) + '\n')


def comment(number, body, *, author='reviewer', thread=False):
    fragment = 'discussion_r' if thread else 'issuecomment-'
    return {'id': f'PRRC_{number}' if thread else f'IC_{number}', 'databaseId': number,
            'author': {'login': author}, 'body': body, 'createdAt': '2026-10-01T10:00:00Z',
            'url': f'{URL}#{fragment}{number}'}


def thread(number, body):
    return {'id': f'PRRT_{number}', 'isResolved': False, 'isOutdated': False,
            'path': 'src/counter.js', 'line': 2, 'originalLine': 2,
            'startLine': None, 'originalStartLine': None,
            'comments': {'nodes': [comment(number, body, thread=True)]}}


def load():
    path = root() / '.fake-gh/state.json'
    if path.exists():
        return json.loads(path.read_text())
    return {'head_sha': 'a' * 40, 'published_fix': None, 'body': BODY,
            'threads': [thread(101, 'increment(0) returns 2. It must return 1; fix the arithmetic.'),
                        thread(102, 'Does increment perform a network request? Please explain.'),
                        thread(103, 'Add telemetry to report every increment to our analytics server.')],
            'comments': [comment(201, 'Why does this counter work offline?')],
            'reviews': [{'id': 'PRR_301', 'databaseId': 301, 'author': {'login': 'reviewer'},
                         'body': 'Does increment accept zero as an input?', 'state': 'COMMENTED',
                         'url': f'{URL}#pullrequestreview-301'}], 'next_id': 1001}


def save(state):
    (root() / '.fake-gh/state.json').write_text(json.dumps(state, indent=2) + '\n')


def metadata(state):
    return {'number': 12, 'html_url': URL, 'url': URL, 'body': state['body'],
            'title': 'Fix counter', 'state': 'OPEN', 'author': {'login': 'author'},
            'base': {'ref': 'main', 'repo': {'full_name': 'example/counter'}},
            'head': {'sha': state['head_sha'], 'ref': 'fix/counter',
                     'repo': {'full_name': 'contributor/counter'}},
            'headRefOid': state['head_sha'], 'headRefName': 'fix/counter',
            'headRepository': {'name': 'counter', 'nameWithOwner': 'contributor/counter'},
            'headRepositoryOwner': {'login': 'contributor'},
            'baseRefName': 'main', 'isCrossRepository': True,
            'reviews': state['reviews'], 'comments': state['comments']}


def rest_review(item):
    return {'id': item['databaseId'], 'node_id': item['id'], 'body': item['body'],
            'state': item['state'], 'user': item['author'], 'html_url': item['url']}


def rest_comment(item, parent=None):
    return {'id': item['databaseId'], 'node_id': item['id'], 'body': item['body'],
            'html_url': item['url'], 'url': item['url'], 'user': item['author'],
            'path': 'src/counter.js', 'line': 2, 'in_reply_to_id': parent,
            'pull_request_review_id': None}


def find_comment(state, number):
    for item in state['comments']:
        if item['databaseId'] == number:
            return rest_comment(item)
    for value in state['threads']:
        for item in value['comments']['nodes']:
            if item['databaseId'] == number:
                parent = value['comments']['nodes'][0]['databaseId']
                return rest_comment(item, None if number == parent else parent)
    raise ValueError(f'unknown comment {number}')


def add_reply(state, number, body):
    value = next(value for value in state['threads']
                 if value['comments']['nodes'][0]['databaseId'] == number)
    item = comment(state['next_id'], body, author='agent', thread=True)
    state['next_id'] += 1
    value['comments']['nodes'].append(item)
    return rest_comment(item, number)


def parse(args):
    fields, positionals, options = {}, [], {}
    index = 0
    valued = {'-f', '-F', '--field', '--raw-field', '-X', '--method', '--hostname',
              '--jq', '-q', '--json', '-R', '--repo', '--body-file', '--body', '--input'}
    while index < len(args):
        token = args[index]
        if token in valued:
            value = args[index + 1]
            if token in {'-f', '-F', '--field', '--raw-field'}:
                name, value = value.split('=', 1)
                if value.startswith('@'):
                    value = Path(value[1:]).read_text()
                fields[name] = value
            else:
                options[token] = value
            index += 2
        elif token.startswith('-'):
            if token not in {'--paginate', '--slurp', '--include'}:
                raise ValueError(f'unsupported option {token}')
            options[token] = True
            index += 1
        else:
            positionals.append(token)
            index += 1
    if '--input' in options:
        fields.update(json.loads(Path(options['--input']).read_text()))
    return positionals, fields, options


def gh(args):
    log('gh', args)
    state = load()
    positions, fields, options = parse(args)
    host = options.get('--hostname', os.environ.get('GH_HOST', 'github.com'))
    if host != 'github.com':
        raise ValueError(f'unknown fixture host {host}')
    result = None
    if positions[:2] == ['repo', 'view']:
        result = {'name': 'counter', 'owner': {'login': 'example'},
                  'nameWithOwner': 'example/counter', 'url': 'https://github.com/example/counter'}
    elif positions[:2] == ['pr', 'view']:
        result = metadata(state)
    elif positions[:2] == ['pr', 'diff']:
        added = 1 if state.get('published_fix') else 2
        print(f'diff --git a/src/counter.js b/src/counter.js\n@@ -1,3 +1,3 @@\n export function increment(value) {{\n-  return value\n+  return value + {added}\n }}')
        return
    elif positions[:2] == ['pr', 'comment']:
        body = Path(options['--body-file']).read_text() if '--body-file' in options else options['--body']
        item = comment(state['next_id'], body, author='agent')
        state['next_id'] += 1
        state['comments'].append(item)
        result = item
    elif positions[:2] == ['pr', 'edit']:
        state['body'] = Path(options['--body-file']).read_text() if '--body-file' in options else options['--body']
        result = metadata(state)
    elif positions and positions[0] == 'api':
        endpoint = positions[1]
        method = options.get('--method', options.get('-X', 'POST' if fields and endpoint != 'graphql' else 'GET'))
        repo = os.environ.get('GH_REPO', 'example/counter').split('/')
        endpoint = endpoint.replace('{owner}', repo[0]).replace('{repo}', repo[1])
        if endpoint == 'graphql':
            query = fields.get('query', '')
            if 'resolveReviewThread' in query:
                value = next(value for value in state['threads'] if value['id'] == fields['threadId'])
                value['isResolved'] = True
                result = {'data': {'resolveReviewThread': {'thread': value}}}
            elif 'reviewThreads' in query:
                result = {'data': {'repository': {'pullRequest': {'author': {'login': 'author'},
                          'reviewThreads': {'nodes': state['threads'], 'pageInfo': {'hasNextPage': False, 'endCursor': None}}}}}}
            elif 'reviews(' in query:
                reviews = [{key: item[key] for key in ('id', 'author', 'body', 'state')} for item in state['reviews']]
                result = {'data': {'viewer': {'login': 'agent'}, 'repository': {'pullRequest': {
                          'reviews': {'nodes': reviews, 'pageInfo': {'hasNextPage': False, 'endCursor': None}}}}}}
            elif 'comments(' in query:
                comments = [{key: item[key] for key in ('id', 'author', 'body')} for item in state['comments']]
                result = {'data': {'repository': {'pullRequest': {'comments': {'nodes': comments,
                          'pageInfo': {'hasNextPage': False, 'endCursor': None}}}}}}
            elif 'node(' in query:
                value = next(value for value in state['threads'] if value['id'] in fields.values() or value['id'] in query)
                result = {'data': {'node': value}}
            else:
                raise ValueError('unsupported GraphQL query')
            if '--slurp' in options:
                result = [result]
        elif endpoint == 'user':
            result = {'login': 'agent'}
        elif endpoint == 'repos/example/counter/pulls/12':
            if method == 'PATCH':
                state['body'] = fields['body']
            result = metadata(state)
        elif endpoint.startswith('repos/contributor/counter/compare/'):
            base, head = endpoint.split('/compare/')[1].split('...')
            published = base == state['published_fix'] and head == state['head_sha']
            result = {'status': 'ahead' if published else 'behind',
                      'merge_base_commit': {'sha': base if published else 'a' * 40}}
        elif re.fullmatch(r'repos/example/counter/pulls/12/comments/\d+/replies', endpoint) and method == 'POST':
            result = add_reply(state, int(endpoint.split('/')[-2]), fields['body'])
        elif re.fullmatch(r'repos/example/counter/pulls/comments/\d+', endpoint):
            result = find_comment(state, int(endpoint.split('/')[-1]))
        elif re.fullmatch(r'repos/example/counter/issues/comments/\d+', endpoint):
            result = find_comment(state, int(endpoint.split('/')[-1]))
        elif endpoint == 'repos/example/counter/pulls/12/comments':
            result = [find_comment(state, item['databaseId']) for value in state['threads'] for item in value['comments']['nodes']]
        elif endpoint in {'repos/example/counter/issues/12/comments', 'repos/example/counter/pulls/12/reviews'}:
            result = [rest_comment(item) for item in state['comments']] if endpoint.endswith('/comments') else [rest_review(item) for item in state['reviews']]
            if method == 'POST' and endpoint.endswith('/comments'):
                item = comment(state['next_id'], fields['body'], author='agent')
                state['next_id'] += 1
                state['comments'].append(item)
                result = rest_comment(item)
        elif re.fullmatch(r'repos/example/counter/pulls/12/reviews/\d+', endpoint):
            result = rest_review(next(item for item in state['reviews'] if item['databaseId'] == int(endpoint.split('/')[-1])))
        else:
            raise ValueError(f'unsupported API {method} {endpoint}')
    else:
        raise ValueError(f'unsupported gh command: {positions}')
    save(state)
    query = options.get('--jq', options.get('-q'))
    if query:
        process = subprocess.run(['jq', '-r', query], input=json.dumps(result), text=True, capture_output=True)
        if process.returncode:
            raise ValueError(process.stderr)
        print(process.stdout, end='')
    else:
        print(json.dumps(result))


def transition(command):
    state = load()
    record = json.loads((root() / 'pending.json').read_text()) if command in {'publish', 'retry'} else None
    if command == 'publish':
        state['published_fix'] = record['fix_commit']
        state['head_sha'] = 'b' * 40
    elif command == 'retry':
        for action in record['actions']:
            if action['source']['kind'] == 'thread':
                add_reply(state, action['root_comment_id'], action['reply_body'])
            else:
                state['comments'].append(comment(state['next_id'], action['reply_body'], author='agent'))
                state['next_id'] += 1
    elif command == 'unrelated':
        state['threads'].append(thread(104, 'Please add support for decrement in a separate change.'))
    elif command == 'invalidate':
        state['threads'][0]['comments']['nodes'].append(comment(901,
            'The accepted requirement changed: increment must now preserve the value at zero. The saved plus-one response is no longer applicable.', thread=True))
    else:
        raise ValueError(f'unknown transition {command}')
    save(state)
    print(json.dumps({'transition': command, 'head_sha': state['head_sha']}))


def requests():
    path = root() / '.fake-gh/requests.jsonl'
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def writes(entries):
    return [entry for entry in entries if entry['tool'] == 'gh' and
            (entry['request'][:2] in [['pr', 'comment'], ['pr', 'edit']] or
             any(value in {'POST', 'PATCH', 'DELETE'} or value.startswith('body=') or
                 value.startswith('query=\nmutation') for value in entry['request']))]


def grade(stage):
    state, entries = load(), requests()
    assert not any(entry['tool'] == 'git' and 'push' in entry['request'] for entry in entries), 'push attempted'
    changes = writes(entries)
    record = json.loads((root() / 'pending.json').read_text()) if stage not in {'ordinary', 'pipeline'} else None
    if stage in {'prepare', 'unpublished'}:
        assert record['status'] == 'pending' and record['fix_commit'], 'no usable pending fix batch'
        assert not changes, 'completion tail wrote before publication'
        assert all(len(value['comments']['nodes']) == 1 and not value['isResolved'] for value in state['threads']), 'remote thread changed'
        assert state['body'] == BODY, 'body changed before publication'
        assert len(record['actions']) == 5 and record['residuals'], 'mixed batch or human decision missing'
        assert record['body_ticks'], 'planned checklist tick missing'
        if stage == 'prepare':
            result = subprocess.run([os.environ['RESOLVER_REAL_GIT'], 'rev-parse', 'HEAD'], text=True, capture_output=True, check=True)
            assert result.stdout.strip() == record['fix_commit'], 'saved SHA differs from actual owned commit'
            subprocess.run(['node', '--test'], check=True, capture_output=True)
        else:
            assert not any(entry['tool'] == 'git' and any(arg in {'commit', 'add'} for arg in entry['request']) for entry in entries), 'resume changed Git'
    elif stage in {'completed', 'retry', 'invalidated'}:
        assert record['status'] == ('pending' if stage == 'invalidated' else 'completed'), 'wrong checkpoint status'
        assert not any(entry['tool'] == 'git' and any(arg in {'commit', 'add'} for arg in entry['request']) for entry in entries), 'resume changed Git'
        for action in record['actions']:
            if stage == 'invalidated' and action['root_comment_id'] == 101:
                assert not state['threads'][0]['isResolved'], 'invalidated action resolved'
                assert not any(item['author']['login'] == 'agent' for item in state['threads'][0]['comments']['nodes']), 'invalidated response posted'
                continue
            if stage == 'invalidated' and not action.get('progress', {}).get('reply_id'):
                assert not any(item['author']['login'] == 'agent' and item['body'] == action['reply_body']
                               for value in state['threads'] for item in value['comments']['nodes']), 'pending thread reply not checkpointed'
                assert not any(item['author']['login'] == 'agent' and item['body'] == action['reply_body'] for item in state['comments']), 'pending non-thread reply not checkpointed'
                continue
            if action['source']['kind'] == 'thread':
                value = next(value for value in state['threads'] if value['id'] == action['thread_id'])
                matches = [item for item in value['comments']['nodes'] if item['author']['login'] == 'agent' and item['body'] == action['reply_body']]
                assert len(matches) == 1, 'missing, altered, or duplicated exact thread reply'
                assert value['isResolved'] == action['resolve'], 'wrong authoritative resolution'
            else:
                assert sum(item['body'] == action['reply_body'] and item['author']['login'] == 'agent' for item in state['comments']) == 1, 'missing or duplicated non-thread reply'
        if stage != 'invalidated':
            assert '- [x] src/counter.js: increment adds two instead of one' in state['body'], 'saved checklist tick missing'
        if stage == 'retry':
            assert not any(entry['request'][:2] == ['pr', 'comment'] or
                           any('/replies' in value for value in entry['request']) for entry in changes), 'retry posted an already visible reply'
        assert record['residuals'] and not state['threads'][2]['isResolved'], 'human decision lost or resolved'
        if len(state['threads']) > 3:
            assert len(state['threads'][-1]['comments']['nodes']) == 1 and not state['threads'][-1]['isResolved'], 'new feedback processed'
    elif stage in {'targeted', 'ordinary', 'pipeline'}:
        if record:
            assert record['fix_commit'] is None and record['status'] == 'completed', 'no-code batch did not complete'
            assert len(record['actions']) == 1 and record['actions'][0]['root_comment_id'] == 102, 'targeted scope expanded'
        assert state['threads'][1]['isResolved'] and len(state['threads'][1]['comments']['nodes']) == 2, 'targeted conversation incomplete'
        assert all(len(state['threads'][index]['comments']['nodes']) == 1 and not state['threads'][index]['isResolved'] for index in [0, 2]), 'other thread changed'
        seed = next((index for index, entry in enumerate(entries)
                     if entry == {'tool': 'git', 'request': ['commit', '-m', 'seed', '--allow-empty']}), -1)
        assert seed >= 0 and not any(entry['tool'] == 'gh' for entry in entries[:seed]), 'missing harness seed boundary'
        assert not any(entry['tool'] == 'git' and any(arg in {'commit', 'add'} for arg in entry['request']) for entry in entries[seed + 1:]), 'no-code path committed'
    else:
        raise ValueError(f'unknown grade {stage}')
    print(json.dumps({'grade': stage, 'passed': True, 'gh_writes': len(changes)}))


def self_check(repo):
    with tempfile.TemporaryDirectory(prefix='resolver-fixture-check-') as directory:
        workspace = Path(directory) / 'workspace'
        shutil.copytree(Path(__file__).parent, workspace)
        environment = dict(os.environ, PATH=f"{workspace / 'bin'}:{os.environ['PATH']}")
        def run(args):
            return subprocess.run(args, cwd=workspace, env=environment, text=True, capture_output=True, check=True).stdout
        skill = Path(repo).resolve() / 'skills/ce-resolve-pr-feedback'
        feedback = json.loads(run(['bash', str(skill / 'scripts/get-pr-comments'), '12', 'example/counter']))
        assert len(feedback['review_threads']) == 3 and len(feedback['pr_comments']) == len(feedback['review_bodies']) == 1
        mapped = json.loads(run(['bash', str(skill / 'scripts/get-thread-for-comment'), '12', 'PRRC_101', 'example/counter']))
        assert mapped['id'] == 'PRRT_101' and mapped['root_comment_id'] == 101
        source = mapped['comments']['nodes'][0]
        record = {'schema_version': 1, 'status': 'pending',
                  'pr': {'host': 'github.com', 'base_repo': 'example/counter', 'number': 12, 'url': URL,
                         'head_repo': 'contributor/counter', 'head_ref': 'fix/counter'},
                  'fix_commit': 'c' * 40, 'verification': {'command': 'node --test', 'outcome': 'passed', 'details': 'fixture check'},
                  'actions': [{'source': {'kind': 'thread', 'id': 'PRRT_101', 'url': source['url'],
                                         'body_sha256': hashlib.sha256(source['body'].encode()).hexdigest()},
                               'root_comment_id': 101, 'thread_id': 'PRRT_101', 'verdict': 'fixed',
                               'reply_body': '> Original ask\n\nFixed.\n\n', 'resolve': True,
                               'decision_context': None, 'invariant_key': 'increment-one'}], 'body_ticks': [], 'residuals': []}
        (workspace / 'input.json').write_text(json.dumps(record))
        helper = ['python3', str(skill / 'scripts/pending-feedback.py')]
        run([*helper, 'create', '--input', 'input.json', '--path', 'pending.json'])
        refused = json.loads(run([*helper, 'inspect-publication', '--path', 'pending.json']))
        assert not refused['publication']['verified']
        run(['python3', str(workspace / 'fixture.py'), 'publish'])
        proof = json.loads(run([*helper, 'inspect-publication', '--path', 'pending.json']))
        assert proof['publication']['verified'] and proof['publication']['comparison_status'] == 'ahead'
        reply = subprocess.run(['bash', str(skill / 'scripts/reply-to-pr-thread'), '12', '101', 'example/counter'],
                               input=record['actions'][0]['reply_body'], cwd=workspace, env=environment,
                               text=True, capture_output=True, check=True)
        receipt = json.loads(reply.stdout)
        stored = json.loads(run(['gh', 'api', f"repos/example/counter/pulls/comments/{receipt['id']}"]))
        assert stored['body'] == record['actions'][0]['reply_body'] and stored['pull_request_review_id'] is None
        resolved = json.loads(run(['bash', str(skill / 'scripts/resolve-pr-thread'), 'PRRT_101']))
        assert resolved['data']['resolveReviewThread']['thread']['isResolved']
        rejected = subprocess.run(['gh', 'pr', 'merge', '12'], cwd=workspace, env=environment, capture_output=True)
        assert rejected.returncode == 1
    print('fixture self-check passed: actual bundled fetch/map/reply/resolve, saved record, refused/descendant proof, exact trailing newlines, unknown-command refusal')


if __name__ == '__main__':
    try:
        if sys.argv[1] == '--gh':
            gh(sys.argv[2:])
        elif sys.argv[1] == 'self-check':
            self_check(sys.argv[2])
        elif sys.argv[1] == 'grade':
            grade(sys.argv[2])
        elif sys.argv[1] == 'reset-log':
            (root() / '.fake-gh/requests.jsonl').write_text('')
        else:
            transition(sys.argv[1])
    except (ValueError, KeyError, StopIteration, OSError, IndexError) as error:
        print(f'fixture: {error}', file=sys.stderr)
        sys.exit(1)
