import os
import sys
import json
import subprocess
import re
import requests
import typing
import urllib.error
import urllib.parse
import urllib.request
from email.message import Message


class Response(typing.NamedTuple):
    body: str
    headers: Message
    status: int
    error_count: int = 0

    def json(self) -> typing.Any:
        """
        Decode body's JSON.

        Returns:
            Pythonic representation of the JSON object
        """
        try:
            output = json.loads(self.body)
        except json.JSONDecodeError:
            output = ""
        return output


def request(
    url: str,
    data: dict = None,
    params: dict = None,
    headers: dict = None,
    method: str = "GET",
    data_as_json: bool = True,
    error_count: int = 0,
) -> Response:
    if not url.casefold().startswith("http"):
        raise urllib.error.URLError(
            "Incorrect and possibly insecure protocol in url")
    method = method.upper()
    request_data = None
    headers = headers or {}
    data = data or {}
    params = params or {}
    headers = {"Accept": "application/json", **headers}

    if method == "GET":
        params = {**params, **data}
        data = None

    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True, safe="/")

    if data:
        if data_as_json:
            request_data = json.dumps(data).encode()
            headers["Content-Type"] = "application/json; charset=UTF-8"
        else:
            request_data = urllib.parse.urlencode(data).encode()

    httprequest = urllib.request.Request(
        url, data=request_data, headers=headers, method=method
    )

    try:
        with urllib.request.urlopen(httprequest) as httpresponse:
            response = Response(
                headers=httpresponse.headers,
                status=httpresponse.status,
                body=httpresponse.read().decode(
                    httpresponse.headers.get_content_charset("utf-8")
                ),
            )
    except urllib.error.HTTPError as e:
        response = Response(
            body=str(e.reason),
            headers=e.headers,
            status=e.code,
            error_count=error_count + 1,
        )

    return response


def extract_personal_contributer_details():
    personal_cla_link = "https://raw.githubusercontent.com/brackets-cont/contributor-license-agreement/main/personal_contributor_licence_agreement.md"
    response = request(url=personal_cla_link, data_as_json=False)
    personal_cla_contents = response.body

    personal_contributers_regex = re.compile('\| *\[([^\s]+)\]\([^\s]+\) *\|')
    personal_contributers = personal_contributers_regex.findall(
        personal_cla_contents)

    return personal_contributers


def extract_employer_contributer_details():
    employer_cla_link = "https://raw.githubusercontent.com/brackets-cont/contributor-license-agreement/main/employer_contributor_license_agreement.md"
    response = request(url=employer_cla_link, data_as_json=False)
    employer_cla_contents = response.body

    employer_contributers_regex = re.compile('\| *\[([^\s]+)\]\([^\s]+\) *\|')
    employer_contributers = employer_contributers_regex.findall(
        employer_cla_contents)

    return employer_contributers


print("current working directory is: ", os.getcwd())

github_info_file = open('./.tmp/github.json', 'r')
github_details = json.load(github_info_file)

commit_info_file = open('./.tmp/commitDetails.json', 'r')
commit_details = json.load(commit_info_file)

if github_details["event_name"] != "pull_request":
    print("Error! This operation is valid on github pull requests. Exiting")
    sys.exit(1)

print("Pull request submitted by github login: ",
      github_details['event']['pull_request']['user']['login'])
print("Number of commits in the pull request: ", len(commit_details))

# Check if current dir is git dir
is_git_dir = subprocess.check_output(
    ['/usr/bin/git', 'rev-parse', '--is-inside-work-tree']).decode('utf-8')
print("Is git dir: ", is_git_dir)

# git status
git_status = subprocess.check_output(
    ['/usr/bin/git', 'status']).decode('utf-8')
print("Git status: ", git_status)

# last n commits
last_n_commit_list = subprocess.check_output(
    ['/usr/bin/git', 'rev-list', '--max-count=10', 'HEAD']).decode('utf-8')
print("last 10 commit ids are: ", last_n_commit_list)

# github logins of all committers
commit_logins = []

for commit in commit_details:
    commiter_github_login = commit['committer']['login']
    if commiter_github_login not in commit_logins:
        commit_logins.append(commiter_github_login)

print("All github users who made changes to the pull request: ", commit_logins)

# github login of all contributers who has signed personal CLA
personal_contributers = extract_personal_contributer_details()
# github login of all contributers who has signed employer CLA
employer_contributers = extract_employer_contributer_details()

for user in commit_logins:
    if user != 'web-flow' and user not in personal_contributers and user not in employer_contributers:
        print("Error!" + user + "has not signed the contributer licence agreement.")
        sys.exit(1)
