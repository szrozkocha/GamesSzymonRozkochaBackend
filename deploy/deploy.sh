#!/bin/bash

DIRNAME=$(dirname "$0")
HOST="ftp.rozkocha.pl"
USER="games@rozkocha.pl"
PASSWORD=$(cat ./${DIRNAME}/auth.properties)
DIRNAME="./${DIRNAME}/../dist/"

cd ${DIRNAME}

ftp -inv $HOST <<EOF
user $USER $PASSWORD
cd backend
mdel .
binary
mput *
cd tmp
put ./../deploy/restart.txt restart.txt
bye
EOF
