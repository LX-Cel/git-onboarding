#!/bin/sh
set -eu
sed -i 's|http://|https://|g' /etc/apk/repositories
apk update
apk upgrade
apk add bash git python3 bubblewrap nano less coreutils findutils diffutils procps
adduser -D -u 1000 -s /bin/bash student
passwd -l root
mkdir -p /home/student/labs /opt/git-onboarding
chown -R student:student /home/student
chmod 700 /home/student
chmod 755 /opt/git-onboarding/sandbox.sh
cp /opt/git-onboarding/wsl.conf /etc/wsl.conf
printf 'Git Onboarding managed practice environment\n' > /etc/git-onboarding
apk info -v > /opt/git-onboarding/packages.txt
