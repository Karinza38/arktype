import { Evaluate, Narrow, Exact, IsAny, WithDefaults } from "@re-/tools"
import { Primitive, Root, Str } from "./definitions"
import { ParseContext, defaultParseContext } from "./definitions/parser.js"
import { stringifyErrors, ValidationErrors } from "./errors.js"
import { format, typeOf } from "./utils.js"
import { CheckTypespaceResolutions } from "./typespace"
import { ReferencesTypeConfig, typeDefProxy } from "./internal.js"

export type Definition = Root.Definition

export type Check<Def, Typespace> = IsAny<Def> extends true
    ? Def
    : Root.Check<Def, Typespace>

export type Parse<
    Def,
    Space,
    Options extends ParseTypeOptions = {}
> = IsAny<Def> extends true
    ? Def
    : Root.Parse<
          Def,
          CheckTypespaceResolutions<Space>,
          WithDefaults<ParseTypeOptions, Options, DefaultParseTypeOptions>
      >

export type ReferencesTypeOptions = {
    asUnorderedList?: boolean
    asList?: boolean
    filter?: string
}

export type References<
    Def extends Root.Definition,
    Options extends ReferencesTypeOptions = {},
    Config extends ReferencesTypeConfig = WithDefaults<
        ReferencesTypeOptions,
        Options,
        { asUnorderedList: false; asList: false; filter: string }
    >
> = Def extends Primitive.Definition
    ? Primitive.References<Def, Config>
    : Def extends string
    ? Str.References<Def, Config>
    : {
          [K in keyof Def]: References<Def[K], Config>
      }

// Just use unknown for now since we don't have all the definitions yet
// but we still want to allow references to other declared types
export type CheckReferences<Def, DeclaredTypeName extends string> = Root.Check<
    Def,
    {
        [TypeName in DeclaredTypeName]: "unknown"
    }
>

export type ParseTypeOptions = {
    onCycle?: Definition
    seen?: Record<string, boolean>
    deepOnCycle?: boolean
    onResolve?: Definition
}

export type DefaultParseTypeOptions = {
    onCycle: never
    seen: {}
    deepOnCycle: false
    onResolve: never
}

export type ValidateOptions = {
    ignoreExtraneousKeys?: boolean
    returnAs?: false | "message" | "map"
}

export type HandledValidationResult<Options extends ValidateOptions> =
    Options["returnAs"] extends "message"
        ? string
        : Options["returnAs"] extends "map"
        ? ValidationErrors
        : void

const withHandledResult =
    (validate: ReturnType<typeof Root.parse>["validate"]) =>
    <Options extends ValidateOptions>(
        value: unknown,
        options?: Options
    ): HandledValidationResult<Options> => {
        const errors = validate(typeOf(value), options)
        if (options?.returnAs === "map") {
            return errors as any
        }
        const message = stringifyErrors(errors)
        if (options?.returnAs === "message") {
            return message as any
        }
        if (message) {
            throw new Error(message)
        }
        return undefined as any
    }

export const createModelFunction =
    <PredefinedTypespace>(
        predefinedTypespace: Narrow<PredefinedTypespace>
    ): ModelFunction<PredefinedTypespace> =>
    (definition, options) => {
        const formattedTypespace: any = format(
            options?.typespace ?? predefinedTypespace
        )
        const context: ParseContext = {
            ...defaultParseContext,
            typespace: formattedTypespace
        }
        const formattedDefinition = format(definition)
        const { validate, references, generate } = Root.parse(
            formattedDefinition,
            context
        ) as any

        return {
            type: typeDefProxy,
            typespace: formattedTypespace,
            definition: formattedDefinition,
            validate: withHandledResult(validate),
            references,
            generate
        } as any
    }

// Exported parse function is equivalent to parse from an empty compile call,
// but optionally accepts a typespace as its second parameter
export const define = createModelFunction({})

export type ModelFunction<PredefinedTypespace> = <
    Def,
    Options extends ParseTypeOptions,
    ActiveTypespace = PredefinedTypespace
>(
    definition: Check<Narrow<Def>, ActiveTypespace>,
    options?: Narrow<
        Options & {
            typespace?: Exact<
                ActiveTypespace,
                CheckTypespaceResolutions<ActiveTypespace>
            >
        }
    >
) => Evaluate<Model<Def, ActiveTypespace, Options>>

export type ReferencesOptions = {}

export type GenerateOptions = {
    // By default, we will throw if we encounter a cyclic required type
    // If this options is provided, we will return its value instead
    onRequiredCycle?: any
}

export type Model<
    Definition,
    Typespace,
    Options,
    ModelType = Evaluate<Parse<Definition, Typespace, Options>>
> = Evaluate<{
    definition: Definition
    type: ModelType
    typespace: Evaluate<Typespace>
    validate: ReturnType<typeof withHandledResult>
    generate: (options?: GenerateOptions) => ModelType
    references: () => References<Definition, { asUnorderedList: true }>
}>
