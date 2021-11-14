import os
import sys
import json
import subprocess
import re
import requests

def extract_personal_contributer_details():
	personal_cla_link = "https://raw.githubusercontent.com/brackets-cont/contributor-license-agreement/main/personal_contributor_licence_agreement.md"
	f = requests.get(personal_cla_link)
	personal_cla_contents = f.text

	personal_contributers_regex = re.compile('\| *\[([^\s]+)\]\([^\s]+\) *\|')
	personal_contributers = personal_contributers_regex.findall(personal_cla_contents)

	return personal_contributers


def extract_employer_contributer_details():
	employer_cla_link = "https://raw.githubusercontent.com/brackets-cont/contributor-license-agreement/main/employer_contributor_license_agreement.md"
	f = requests.get(employer_cla_link)
	employer_cla_contents = f.text

	employer_contributers_regex = re.compile('\| *\[([^\s]+)\]\([^\s]+\) *\|')
	employer_contributers = employer_contributers_regex.findall(employer_cla_contents)

	return employer_contributers


print("current working directory is: ", os.getcwd())

github_info_file = open('./.tmp/github.json', 'r') 
github_details = json.load(github_info_file)

commit_info_file = open('./.tmp/commitDetails.json', 'r') 
commit_details = json.load(commit_info_file)

if github_details["event_name"] != "pull_request":
    print("Error! This operation is valid on github pull requests. Exiting")
    sys.exit(1)

print("Pull request submitted by github login: ", github_details['event']['pull_request']['user']['login'])
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


