<template>
  <div>
    <!-- String/Text Input -->
    <Field
      v-if="setting.dataType === 'string'"
      :name="fieldName"
      :id="fieldName"
      type="text"
      :class="getInputClasses()"
      :aria-invalid="hasError && isTouched"
      :aria-describedby="hasError ? `error-${fieldName}` : undefined"
      @input="$emit('field-changed', fieldName, $event.target.value)"
    />

    <!-- Number Input -->
    <Field
      v-else-if="setting.dataType === 'number'"
      :name="fieldName"
      :id="fieldName"
      type="number"
      :class="getInputClasses()"
      :aria-invalid="hasError && isTouched"
      :aria-describedby="hasError ? `error-${fieldName}` : undefined"
      @input="
        $emit(
          'field-changed',
          fieldName,
          parseFloat($event.target.value) || null,
        )
      "
    />

    <!-- Boolean Toggle -->
    <div
      v-else-if="setting.dataType === 'boolean'"
      class="flex items-center space-x-3"
    >
      <Field
        :name="fieldName"
        :id="fieldName"
        type="checkbox"
        class="sr-only"
        @change="$emit('field-changed', fieldName, $event.target.checked)"
        v-slot="{ field }"
      >
        <label
          :for="fieldName"
          class="flex items-center space-x-3 cursor-pointer"
        >
          <div class="relative">
            <div
              :class="[
                'w-10 h-6 rounded-full transition-colors',
                field.value ? 'bg-baba-accent' : 'bg-gray-600',
              ]"
            >
              <div
                :class="[
                  'w-4 h-4 bg-white rounded-full shadow transform transition-transform mt-1',
                  field.value ? 'translate-x-5' : 'translate-x-1',
                ]"
              />
            </div>
          </div>
          <span class="text-sm">{{
            field.value ? "Enabled" : "Disabled"
          }}</span>
        </label>
      </Field>
    </div>

    <!-- JSON Textarea -->
    <Field
      v-else-if="setting.dataType === 'json'"
      :name="fieldName"
      :id="fieldName"
      as="textarea"
      rows="4"
      :class="getInputClasses() + ' font-mono text-sm'"
      placeholder="Enter valid JSON..."
      :aria-invalid="hasError && isTouched"
      :aria-describedby="hasError ? `error-${fieldName}` : undefined"
      @input="$emit('field-changed', fieldName, $event.target.value)"
    />

    <ErrorMessage
      :name="fieldName"
      :id="`error-${fieldName}`"
      class="text-error text-xs mt-1"
    />
  </div>
</template>

<script setup lang="ts">
import { Field, ErrorMessage } from "vee-validate";

interface Props {
  setting: {
    dataType: string;
    [key: string]: unknown;
  };
  fieldName: string;
  hasError: boolean;
  isTouched: boolean;
}

const props = defineProps<Props>();
defineEmits<{
  "field-changed": [fieldName: string, value: unknown];
}>();

const getInputClasses = () => {
  const baseClasses =
    "w-full px-3 py-2 bg-gray-800 border rounded-lg text-baba-text focus:outline-none transition-colors";
  const errorClasses =
    props.hasError && props.isTouched
      ? "border-red-500 focus:border-red-400"
      : "border-gray-600 focus:border-baba-accent";
  return `${baseClasses} ${errorClasses}`;
};
</script>
