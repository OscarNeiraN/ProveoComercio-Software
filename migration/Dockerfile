FROM alpine:3.20

RUN apk add --no-cache mariadb-client

WORKDIR /migration

COPY import.sh /usr/local/bin/import-db
COPY dump.sql /migration/dump.sql

RUN chmod +x /usr/local/bin/import-db

CMD ["import-db"]
