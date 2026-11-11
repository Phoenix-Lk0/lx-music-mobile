#!/usr/bin/env python3
"""索引健康检查：主地址失效则切到镜像，两者都失效则标记 dead"""
import json
import subprocess
import time
import urllib.error
import urllib.request

INDEX = 'library/index.json'


def probe(url, retries=2):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, method='GET')
            req.add_header('User-Agent', 'lx-lib-healthcheck/1.0')
            with urllib.request.urlopen(req, timeout=20) as r:
                body = r.read(4096)
                if r.status == 200 and len(body) > 100:
                    return True
        except Exception:
            pass
        time.sleep(1)
    return False


def main():
    with open(INDEX, encoding='utf-8') as f:
        idx = json.load(f)

    changed = 0
    for s in idx['sources']:
        primary = s['scriptUrl']
        mirror = s.get('mirrorUrl')
        # 本仓库自托管脚本也在检查范围内，但不会回退
        if probe(primary):
            if s.get('status') != 'ok':
                s['status'] = 'ok'
                s.pop('httpFail', None)
                changed += 1
            continue

        if mirror and probe(mirror):
            s.setdefault('originUrl', primary)
            s['scriptUrl'] = mirror
            s['status'] = 'ok'
            s['failedOver'] = time.strftime('%Y-%m-%d')
            changed += 1
            print(f"FAILOVER {s['name']} -> mirror")
        else:
            if s.get('status') != 'dead':
                s['status'] = 'dead'
                s['deadSince'] = time.strftime('%Y-%m-%d')
                changed += 1
                print(f"DEAD {s['name']}")

    if changed:
        idx['updatedAt'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        ok = sum(1 for x in idx['sources'] if x.get('status', 'ok') == 'ok')
        idx['notice'] = f'共 {len(idx["sources"])} 条，可用 {ok} 条（{idx["updatedAt"]} 自动体检）'
        with open(INDEX, 'w', encoding='utf-8') as f:
            json.dump(idx, f, ensure_ascii=False, indent=2)
    print(f'变更 {changed} 条')
    # 供 workflow 判断是否需要提交
    subprocess.run(['bash', '-c', f'test {changed} -gt 0'])


if __name__ == '__main__':
    main()
