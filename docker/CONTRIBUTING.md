# PiGallery2 Docker Contribution guide (draft)

Remember to update all the Dockerfiles.

## Linting
To quality check your dockerfile changes you can use hadolint:

1. Start the docker daemon if it's not already started: `sudo dockerd`
2. Change dir to the docker folder.
3. Run hadolint on the alpine dockerfile: `docker run --rm -i -v ./.config/hadolint.yml:/.config/hadolint.yaml hadolint/hadolint < ./alpine/Dockerfile.build`
4. Run hadolint on the debian-trixie dockerfile: `docker run --rm -i -v ./.config/hadolint.yml:/.config/hadolint.yaml hadolint/hadolint < ./debian-trixie/Dockerfile.build`
7. Run hadolint on the debian-trixie selfcontained dockerfile: `docker run --rm -i -v ./.config/hadolint.yml:/.config/hadolint.yaml hadolint/hadolint < ./debian-trixie/selfcontained/Dockerfile`
8. Fix errors and warnings or add them to ignore list of the [hadolint configuration file](./.config/hadolint.yml) if there is a good reason for that. Read more [here](https://github.com/hadolint/hadolint).

### Building the docker image locally
TBD
