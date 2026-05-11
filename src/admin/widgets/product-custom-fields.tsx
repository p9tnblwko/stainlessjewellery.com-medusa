import { defineWidgetConfig } from "@medusajs/admin-sdk"
import {
  Button,
  Container,
  Heading,
  Input,
  Label,
  Text,
  toast,
} from "@medusajs/ui"
import { useEffect, useMemo, useState } from "react"

type ProductCustomFields = {
  stone_type: string[]
  finish_plating: string[]
  ring_style: string[]
  earring_style: string[]
  plating: string[]
}

type ProductCustomFieldsForm = {
  stone_type: string
  finish_plating: string
  ring_style: string
  earring_style: string
  plating: string
}

type ProductCustomFieldsWidgetProps = {
  data?: {
    id?: string
  }
}

const EMPTY_FIELDS: ProductCustomFieldsForm = {
  stone_type: "",
  finish_plating: "",
  ring_style: "",
  earring_style: "",
  plating: "",
}

const FIELD_CONFIG: {
  key: keyof ProductCustomFieldsForm
  label: string
  placeholder: string
}[] = [
  {
    key: "stone_type",
    label: "Stone type",
    placeholder: "diamond, pearl",
  },
  {
    key: "finish_plating",
    label: "Finish plating",
    placeholder: "gold, rhodium",
  },
  {
    key: "ring_style",
    label: "Ring style",
    placeholder: "solitaire, stackable",
  },
  {
    key: "earring_style",
    label: "Earring style",
    placeholder: "stud, hoop",
  },
  {
    key: "plating",
    label: "Plating",
    placeholder: "Gold, Rhodium",
  },
]

function toFormFields(value?: Partial<ProductCustomFields> | null) {
  return FIELD_CONFIG.reduce<ProductCustomFieldsForm>((acc, field) => {
    const fieldValue = value?.[field.key]

    acc[field.key] = Array.isArray(fieldValue) ? fieldValue.join(", ") : ""

    return acc
  }, { ...EMPTY_FIELDS })
}

function toPayload(fields: ProductCustomFieldsForm): ProductCustomFields {
  return FIELD_CONFIG.reduce<ProductCustomFields>((acc, field) => {
    acc[field.key] = fields[field.key]
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)

    return acc
  }, {
    stone_type: [],
    finish_plating: [],
    ring_style: [],
    earring_style: [],
    plating: [],
  })
}

const ProductCustomFieldsWidget = ({
  data,
}: ProductCustomFieldsWidgetProps) => {
  const productId = data?.id
  const [fields, setFields] = useState<ProductCustomFieldsForm>(EMPTY_FIELDS)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const endpoint = useMemo(() => {
    return productId ? `/admin/products/${productId}/custom-fields` : null
  }, [productId])

  useEffect(() => {
    if (!endpoint) {
      setIsLoading(false)
      return
    }

    const requestUrl = endpoint
    const controller = new AbortController()

    async function loadCustomFields() {
      setIsLoading(true)

      try {
        const response = await fetch(requestUrl, {
          credentials: "include",
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error("Failed to load custom fields")
        }

        const payload = await response.json()
        setFields(toFormFields(payload.custom_fields))
      } catch (error) {
        if (!controller.signal.aborted) {
          toast.error("Failed to load custom fields")
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    loadCustomFields()

    return () => {
      controller.abort()
    }
  }, [endpoint])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!endpoint) {
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toPayload(fields)),
      })

      if (!response.ok) {
        throw new Error("Failed to save custom fields")
      }

      const payload = await response.json()
      setFields(toFormFields(payload.custom_fields))
      toast.success("Custom fields saved")
    } catch (error) {
      toast.error("Failed to save custom fields")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Container className="divide-y p-0">
      <div className="px-6 py-4">
        <Heading level="h2">Custom fields</Heading>
        <Text className="text-ui-fg-subtle" size="small">
          Filterable jewelry attributes used by the storefront.
        </Text>
      </div>
      <form className="flex flex-col gap-y-4 px-6 py-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {FIELD_CONFIG.map((field) => (
            <div className="flex flex-col gap-y-1" key={field.key}>
              <Label htmlFor={`custom-field-${field.key}`} size="small">
                {field.label}
              </Label>
              <Input
                id={`custom-field-${field.key}`}
                placeholder={field.placeholder}
                value={fields[field.key]}
                disabled={isLoading || isSaving}
                onChange={(event) => {
                  setFields((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button
            size="small"
            type="submit"
            isLoading={isSaving}
            disabled={isLoading || !endpoint}
          >
            Save
          </Button>
        </div>
      </form>
    </Container>
  )
}

export const config = defineWidgetConfig({
  zone: "product.details.after",
})

export default ProductCustomFieldsWidget
