import json
import sys


DROP_FIELDS = {
    "taskDefinitionArn",
    "revision",
    "status",
    "requiresAttributes",
    "compatibilities",
    "registeredAt",
    "registeredBy",
}


def main() -> int:
    if len(sys.argv) != 4:
        print("usage: render-task-definition.py <taskdef.json> <container-name> <image>", file=sys.stderr)
        return 2

    path, container_name, image = sys.argv[1:]
    with open(path, "r", encoding="utf-8") as handle:
        taskdef = json.load(handle)

    for field in DROP_FIELDS:
        taskdef.pop(field, None)

    updated = False
    for container in taskdef.get("containerDefinitions", []):
        if container.get("name") == container_name:
            container["image"] = image
            updated = True
            break

    if not updated:
        print(f"container not found in task definition: {container_name}", file=sys.stderr)
        return 1

    print(json.dumps(taskdef, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
