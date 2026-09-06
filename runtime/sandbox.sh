#!/bin/sh
set -eu
# This script is root-owned. Only the student's Linux home is writable/persistent.
# No Windows mounts, WSL interop, host sockets, network, or other distro paths.
ulimit -u 128
ulimit -f 262144
ulimit -v 1048576
exec /usr/bin/bwrap --unshare-all --die-with-parent --cap-drop ALL \
  --ro-bind /usr /usr --ro-bind /bin /bin --ro-bind /sbin /sbin \
  --ro-bind /lib /lib --ro-bind /etc /etc \
  --ro-bind /opt/git-onboarding /opt/git-onboarding \
  --proc /proc --dev /dev --tmpfs /tmp --dir /run \
  --bind /home/student /home/student \
  --clearenv --setenv HOME /home/student --setenv USER student \
  --setenv LOGNAME student --setenv SHELL /bin/bash \
  --setenv PATH /usr/local/bin:/usr/bin:/bin --setenv TERM xterm-256color \
  --setenv LANG C.UTF-8 --setenv LC_ALL C.UTF-8 \
  --chdir /home/student "$@"
