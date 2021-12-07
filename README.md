# angelscripts-stem-docker

[organic-stem-skeleton v3](https://github.com/node-organic/organic-stem-skeleton) based docker related utilities.

* image building
* compose management
* image publishing

## setup

```
cd cells/myCell
npm i angelscripts-stem-docker --save-dev
```

## usage

### build a stem skeleton cell

```
$ cd cells/myCell
$ edit ./Dockerfile
$ npx angel docker-build
```

#### Dockerfile

`docker-build` command accepts Dockerfiles as templates and replaces everything within `#deps>` & `#<deps` markers with cell's package dependencies.

Here is example file:

```
# Dockerfile context is repo's root
# Dockerfile is a template
# usage 
# $ cd cells/cell89 && npx angel docker build ./docker/Dockerfile

FROM node:16-alpine as base
RUN apk update && apk upgrade
RUN apk add --no-cache bash git openssh

ARG mode='production'
ARG cellName='cell89'
ARG cellRoot='cells/cell89'

ENV NODE_ENV $mode

#deps>
#
# cell package dependencies will be inserted here as 
# COPY ./packages/package/ /repo/packages/package/
# RUN cd /packages/package/ && npm install --$mode
# 
#<deps

COPY ./dna/ ./repo/dna/
COPY ./$cellRoot/ /repo/$cellRoot/
RUN cd /repo/$cellRoot/ && npm install --$mode

WORKDIR /repo/$cellRoot/
CMD node index.js
```

### compose up & down

`docker-compose` command uses `docker-compose.yaml` from cell's DNA so that all DNA related features are supported and the file can be used as a template. The command prefills image, ports & volumes using cell's DNA as well as dependent packages.

```
$ cd cells/myCell
$ edit ./dna/docker-compose.yaml
$ npx angel docker-compose up
...
$ npx angel docker-compose down
```

#### docker-compose.yaml

```
# the compose file is applied with repo's root as context
# usage:
# $ cd cells/myCell && npx angel docker-compose
version: "3.4"
services:
  myCell:
    # if not set
    # image: 
      # auto populated as node alpine
    # ports: 
      # auto populated using cellDNA.port in _development mode if present
    # volumes: 
      # auto populated with repo/dna, repo/cell, repo cell's packages
    working_dir: "/repo/@{cells.myCell.cwd}"
    environment:
      NODE_ENV: development
      CELL_MODE: _development
    command: npm run dev
    labels: 
      route: '/myCell'
```

### publish image

`docker-publish` command is a shorthand to build, tag and publish the Dockerfile. It uses cell's dna `docker-registry` property in order to publish at remote container registry.

```
$ cd cells/myCell
$ npx angel docker-publish
```