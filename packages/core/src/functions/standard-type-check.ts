import assert from "tiny-invariant";

import type { CheckResult, FuncArg, FuncSpecArgType, Spec } from "./index.js";
import type { FuncGivenArg } from "./types.js";

const makeTypeCheck = (spec: Spec) => {
  return (givenTypes: readonly FuncGivenArg[]): CheckResult => {
    let error = generalChecks(spec, givenTypes);

    if (error === undefined) {
      error = argumentChecks(spec.args, givenTypes);
    }

    if (error === undefined) {
      const resolvedReturnType =
        typeof spec.returnType === "function" ? spec.returnType(givenTypes) : spec.returnType;

      return { errors: [], returnType: resolvedReturnType };
    }

    const resolvedReturnType = typeof spec.returnType === "function" ? "unknown" : spec.returnType;

    return { errors: [error], returnType: resolvedReturnType };
  };
};

function generalChecks(spec: Spec, givenTypes: readonly FuncGivenArg[]): string | undefined {
  const requiredArgsCount = spec.args.length - spec.optionalArgs;
  assert(requiredArgsCount >= 0);

  if (givenTypes.length < requiredArgsCount) {
    return `${spec.name} expects at least ${requiredArgsCount} arguments, but ${givenTypes.length} were given`;
  }

  if (spec.lastArgRepeats === false && givenTypes.length > spec.args.length) {
    return `${spec.name} only accepts ${spec.args.length} arguments, but ${givenTypes.length} were given`;
  }

  if (givenTypes.length > 100) {
    return `Functions cannot accept more than 100 arguments, but ${givenTypes.length} were given to ${spec.name}`;
  }
}

const CONDITIONS_TYPE_MATCH: FuncSpecArgType = {
  match: "is",
  type: "boolean",
};

function argumentChecks(args: FuncArg[], givenTypes: readonly FuncGivenArg[]): string | undefined {
  for (let i = 0; i < givenTypes.length; i++) {
    const givenType = givenTypes[i];
    let funcArg: FuncArg;

    if (i >= args.length) {
      funcArg = args[args.length - 1];
    } else {
      funcArg = args[i];
    }

    const typeMatch = funcArg.type === "condition" ? CONDITIONS_TYPE_MATCH : funcArg.typeMatch;

    switch (typeMatch.match) {
      case "is":
        if (typeMatch.type !== "any") {
          if (givenType.type !== typeMatch.type) {
            return argErrorMessage(i, funcArg, givenType);
          }
        }
        if (typeMatch.customChecker !== undefined) {
          const error = typeMatch.customChecker(givenType, givenTypes, i);
          if (error !== undefined) return error;
        }
        break;
      case "oneOf":
        const allowedTypes = new Set<string>(typeMatch.type);
        if (allowedTypes.has(givenType.type) === false) {
          return argErrorMessage(i, funcArg, givenType);
        }
        if (typeMatch.customChecker !== undefined) {
          const error = typeMatch.customChecker(givenType, givenTypes, i);
          if (error !== undefined) return error;
        }
        break;
      case "literal":
        const allowedValues = new Set<string | number | boolean>(typeMatch.type);
        if (
          givenType.literalValue === undefined ||
          allowedValues.has(givenType.literalValue) === false
        ) {
          return argErrorMessage(i, funcArg, givenType);
        }
        break;
      default:
        const _exhaustiveCheck: never = typeMatch;
        return _exhaustiveCheck;
    }
  }
}

function argErrorMessage(i: number, expectedType: FuncArg, givenType: FuncGivenArg) {
  const typeMatch =
    expectedType.type === "condition" ? CONDITIONS_TYPE_MATCH : expectedType.typeMatch;
  const desc = expectedTypeDescription(typeMatch);
  return `Argument ${i + 1} (${expectedType.name}) must be ${desc}, but is a ${givenType.type}`;
}

function expectedTypeDescription(typeMatch: FuncSpecArgType) {
  switch (typeMatch.match) {
    case "is":
      return `a ${typeMatch.type}`;
    case "oneOf":
      return `a ${niceList(typeMatch.type)}`;
    case "literal":
      return niceList(typeMatch.type.map((x) => `"${x}"`));
    default:
      const _exhaustiveCheck: never = typeMatch;
      return _exhaustiveCheck;
  }
}

function niceList(list: (string | number | boolean)[]) {
  const allButLast = list.slice(0, -1);
  const last = list[list.length - 1];
  if (list.length > 1) {
    return `${allButLast.join(", ")} or ${last}`;
  } else {
    return last;
  }
}

export { makeTypeCheck };
