<template><button :class="mergedClasses" :type="type" @click="$emit('click', $event)">
  <i :class="icon" /> {{ text }}
</button></template>

<script setup lang="ts">
import { computed, type PropType } from "vue";

const props = defineProps({
  text: { type: String, default: "" },
  icon: { type: String, default: "" },
  style: { type: String, default: "" },
  type: {
    type: String as PropType<"button" | "submit" | "reset">,
    default: "button"
  }
});

defineEmits(["click"]);

// Only define conflict groups for CSS properties used in the default design
const conflictGroups = {
  width: ["w-"],
  height: ["h-"],
  backgroundColor: ["bg-"],
  borderRadius: ["rounded"],
  display: ["block", "inline-block", "flex", "inline-flex", "grid", "hidden"],
  color: ["text-"],
  justify: ["justify-"],
  items: ["items-"],
  fontWeight: [
    "font-thin",
    "font-light",
    "font-normal",
    "font-medium",
    "font-semibold",
    "font-bold",
  ],
  padding: ["p-", "px-", "py-", "pt-", "pb-", "pl-", "pr-"],
  transition: ["transition-"],
};

function _extractBaseClass(className: string): string {
  // Remove responsive prefix (sm:, md:, lg:, xl:, 2xl:) to get base class
  return className.includes(":") ? className.split(":", 2)[1] : className;
}

function _getConflictGroup(className: string): string | null {
  const baseClass = _extractBaseClass(className);

  for (const [groupName, prefixes] of Object.entries(conflictGroups)) {
    if (
      prefixes.some(
        (prefix) => baseClass.startsWith(prefix) || baseClass === prefix,
      )
    ) {
      return groupName;
    }
  }
  return null;
}

function _resolveClassConflictsWithResponsive(
  baseClasses: string,
  styleClasses: string,
): string {
  const base = baseClasses.split(" ").filter(Boolean);
  const style = styleClasses.split(" ").filter(Boolean);

  // Find which conflict groups have ANY responsive or base overrides in style
  const overriddenGroups = new Set<string>();

  for (const styleClass of style) {
    const group = _getConflictGroup(styleClass);
    if (group) {
      overriddenGroups.add(group);
    }
  }

  // Remove ALL base classes (including responsive variants) that belong to overridden groups
  const filteredBase = base.filter((baseClass) => {
    const group = _getConflictGroup(baseClass);
    return !group || !overriddenGroups.has(group);
  });

  return [...filteredBase, ...style].join(" ");
}

const mergedClasses = computed(() => {
  const baseClasses =
    "w-auto h-auto sm:h-10 bg-accent rounded text-slate hover:bg-accentHover transition-colors font-bold p-1.5 md:p-2 inline-flex justify-center items-center";

  return _resolveClassConflictsWithResponsive(baseClasses, props.style);
});
</script>
