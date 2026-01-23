# PiGallery2 Docker Contribution Guide

Remember to update all the Dockerfiles.

## Linting
To quality check your Dockerfile changes, you can use hadolint:

1. Start the Docker daemon if it's not already started.
2. Change directory to the `docker/` folder.
3. Run hadolint on the Dockerfiles:
```bash
docker run --rm -i -v ./.config/hadolint.yml:/.config/hadolint.yaml hadolint/hadolint < ./alpine/Dockerfile.build
docker run --rm -i -v ./.config/hadolint.yml:/.config/hadolint.yaml hadolint/hadolint < ./debian-trixie/Dockerfile.build
```

Fix errors and warnings or add them to the ignore list of the [hadolint configuration file](https://github.com/bpatrik/pigallery2/blob/master/docker/.config/hadolint.yml) if there is a good reason for that.
