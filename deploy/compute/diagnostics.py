"""Bounded startup diagnostics; never dump Docker configuration/environment."""
import pathlib
import re
import subprocess
import sys
from urllib.parse import urlsplit, unquote


def main():
    # Fail closed if the environment cannot be read for redaction.
    secrets = set()
    for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        _, sep, value = line.partition('=')
        if sep and value:
            secrets.add(value)
            if '://' in value:
                try:
                    password = urlsplit(value).password
                    if password:
                        secrets.update((password, unquote(password)))
                except ValueError:
                    pass

    def report(args):
        try:
            result = subprocess.run(['docker', *args], capture_output=True, text=True,
                                    errors='replace', timeout=15)
            output = result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            output = 'Diagnostic command timed out.'
        for value in sorted(secrets, key=len, reverse=True):
            output = output.replace(value, '[REDACTED]')
        output = re.sub(r'(\w+://)[^\s/@]+:[^\s/@]+@', r'\1[REDACTED]@', output)
        print(output, flush=True)

    for container in ('kwonserver', 'kwonserver-worker'):
        print(f'--- Startup diagnostics: {container} ---', flush=True)
        report(['inspect', '--format',
                'status={{.State.Status}} exit={{.State.ExitCode}} '
                'oomKilled={{.State.OOMKilled}} restarts={{.RestartCount}} '
                'health={{json .State.Health}}', container])
        report(['logs', '--tail', '80', container])


if __name__ == '__main__':
    main()
