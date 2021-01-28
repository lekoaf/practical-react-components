import React, {
  useMemo,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  ReactNode,
} from 'react'
import styled, { css, useTheme } from 'styled-components'
import { useBoolean } from 'react-hooks-shareable'

import { Icon } from '../Icon'
import { ArrowDownIcon, ArrowUpIcon, SmallerCheckIcon } from './icons'
import { componentSize, opacity, shape, spacing } from '../designparams'
import { Typography } from '../Typography'
import { getWidth, scrollIntoView, findPrevIndex, findNextIndex } from './utils'
import { ISelectMarker } from '../theme'

import { PopOver, IPopOverProps } from '../PopOver'
import { anchorPosition } from '../PopOver/utils'

export type DirectionType = 'auto' | 'up' | 'down'

const SelectList = styled.ul<{
  readonly align: string
}>`
  display: block;
  padding: ${spacing.medium} 0;
  margin: 0;
  min-width: 100%;
  height: 100%;

  background-color: ${({ theme }) => theme.color.background05()};
  box-shadow: ${({ theme }) => theme.shadow.selectList};
  border-radius: ${shape.radius.medium};
  overflow: hidden auto;

  list-style: none;
  white-space: nowrap;

  font-family: ${({ theme }) => theme.font.family};
  font-size: ${({ theme }) => theme.font.size.regular};
  line-height: ${({ theme }) => theme.font.lineHeight.large};
  text-align: left;

  ${({ align }) =>
    align === 'left'
      ? css`
          left: 0;
        `
      : css`
          right: 0;
        `};
`

const SelectItem = styled.li<{
  readonly selected: boolean
  readonly disabled: boolean
  readonly compact: boolean
}>`
  color: ${({ theme }) => theme.color.text01()};
  min-height: ${({ compact }) =>
    compact ? componentSize.small : componentSize.medium};
  padding: 0 ${spacing.medium};
  display: flex;
  flex-direction: column;
  align-items: left;
  justify-content: center;
  cursor: pointer;

  ${({ selected }) =>
    selected
      ? css`
          background-color: ${({ theme }) => theme.color.background02()};
        `
      : undefined}

  ${({ disabled }) =>
    disabled
      ? css`
          cursor: default;
          color: ${({ theme }) => theme.color.text05()};
        `
      : css`
          &:hover,
          &.arrow-select {
            background-color: ${({ theme }) => theme.color.background02()};
          }

          &:active {
            outline: none;
            background-color: ${({ theme }) => theme.color.background01()};
          }
        `};
`

const NoOptionsText = styled(Typography)`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.text01()};
`

const CheckIcon = styled(Icon).attrs({ icon: SmallerCheckIcon })`
  color: ${({ theme }) => theme.color.text05()};
`

const CheckItemRow = styled.div`
  display: flex;
  align-items: center;

  ${CheckIcon} {
    margin-right: ${spacing.medium};
  }
`

interface ISelectOption extends IBaseOption {
  readonly index: number
  // eslint-disable-next-line functional/prefer-readonly-type
  readonly itemRefs: ISelectPopoverProps['itemRefs']
  readonly compact: boolean
  readonly selected: boolean
  readonly selectMarker: ISelectMarker
  readonly role?: string
  readonly onClick?: (event: React.SyntheticEvent) => void
}

const SelectOption: React.FC<ISelectOption> = ({
  value,
  disabled = false,
  onClick,
  compact,
  selectMarker,
  role,
  selected,
  itemRefs,
  index,
  component,
}) => {
  const ref = useMemo(
    () => (el: HTMLLIElement | null) =>
      el !== null ? itemRefs.current.set(index, el) : undefined,
    [itemRefs, index]
  )

  // We prevent default on pointer down to prevent the blur from happening
  // which would hide the menu before allowing us to click
  const handlePointerDown = useCallback(e => e.preventDefault(), [])

  const item =
    selected && selectMarker === 'check' ? (
      <CheckItemRow>
        <CheckIcon />
        {component}
      </CheckItemRow>
    ) : (
      component
    )

  return (
    <SelectItem
      value={value}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onClick={onClick}
      compact={compact}
      role={role}
      selected={selected && selectMarker === 'background'}
      ref={ref}
    >
      {item}
    </SelectItem>
  )
}

interface ISelectPopoverProps<V extends string = string>
  extends Required<Pick<IBaseSelectProps, 'direction' | 'align' | 'compact'>>,
    IPopOverProps {
  readonly anchorEl: HTMLDivElement | null
  readonly onKeyDown: (event: React.KeyboardEvent) => void
  readonly isOpen: boolean
  readonly listRef: React.RefObject<HTMLUListElement>
  // eslint-disable-next-line functional/prefer-readonly-type
  readonly itemRefs: React.MutableRefObject<Map<number, HTMLLIElement>>
  readonly valueIndex: number | null
  readonly optionHandlers: ReadonlyArray<(event: React.SyntheticEvent) => void>
  readonly options: ReadonlyArray<IBaseOption<V>>
  readonly noOptionsLabel?: string
  readonly onScroll: VoidFunction
  readonly selectMarker: ISelectMarker
}

export const SelectPopover: React.FC<ISelectPopoverProps> = ({
  anchorEl,
  compact: compactFromProps,
  selectMarker: selectMarkerFromProps,
  direction,
  align,
  isOpen,
  listRef,
  options,
  optionHandlers,
  itemRefs,
  valueIndex,
  noOptionsLabel,
  onScroll,
  ...props
}) => {
  const {
    compact: compactFromTheme,
    selectMarker: selectMarkerFromTheme,
  } = useTheme()
  const compact = compactFromProps ?? compactFromTheme
  const selectMarker = selectMarkerFromProps ?? selectMarkerFromTheme

  const MAX_HEIGHT = 320
  const MIN_HEIGHT = 160

  const onDropdownPosition = useCallback(
    (anchorElement, popOverContainerEl) => {
      if (listRef?.current === null) {
        return
      }

      const anchorBBox = anchorElement.getBoundingClientRect()
      const { top, bottom, left, right } = anchorBBox
      popOverContainerEl.style.minWidth = `${right - left}px`

      // Calculate available space above and below
      const { clientHeight } = document.documentElement
      const spaceBelow = clientHeight - bottom - 16
      const spaceAbove = top - 16

      let nextDirection: DirectionType = direction

      // Convert automatic direction to up or down
      if (nextDirection === 'auto') {
        // Doesn't fit below, more space above
        if (spaceBelow < MIN_HEIGHT && spaceAbove > spaceBelow) {
          nextDirection = 'up'
        } else {
          nextDirection = 'down'
        }
      }

      // Vertical position and alignment from up or down direction
      let verticalPosition: 'bottom' | 'top' = 'bottom'
      let verticalAlignment: 'bottom' | 'top' = 'top'
      let nextHeight = Math.min(spaceBelow, MAX_HEIGHT)
      if (nextDirection === 'up') {
        verticalPosition = 'top'
        verticalAlignment = 'bottom'
        nextHeight = Math.min(spaceAbove, MAX_HEIGHT)
        listRef.current.scrollTop = listRef.current.scrollHeight
      }

      // Update height and position
      listRef.current.style.maxHeight = `${nextHeight}px`
      anchorPosition(anchorElement, popOverContainerEl, {
        horizontalAlignment: align,
        horizontalPosition: align,
        verticalPosition,
        verticalAlignment,
      })
    },
    [align, direction, listRef]
  )

  if (!isOpen) {
    return null
  }

  return (
    <PopOver
      anchorEl={anchorEl}
      onPosition={onDropdownPosition}
      onScroll={onScroll}
      {...props}
    >
      <SelectList align={align} role="menu" ref={listRef}>
        {options.length === 0 && noOptionsLabel !== undefined ? (
          <NoOptionsText variant="explanatory-text">
            {noOptionsLabel}
          </NoOptionsText>
        ) : (
          options.map((option, index) => (
            <SelectOption
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              onClick={optionHandlers[index]}
              compact={compact}
              role="menuitem"
              selected={index === valueIndex}
              selectMarker={selectMarker}
              component={option.component}
              itemRefs={itemRefs}
              index={index}
            />
          ))
        )}
      </SelectList>
    </PopOver>
  )
}

const SelectInsideContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 100%;
`

const SelectContainer = styled.div<{
  readonly width: string
}>`
  width: ${({ width }) => getWidth(width)};
`

const SelectInput = styled.div<{
  readonly compact: boolean
  readonly variant: string
  readonly hasError: boolean
  readonly openedFocus: boolean
  readonly visibleFocus: boolean
  readonly disabled: boolean
}>`
  display: flex;
  align-items: center;
  min-height: ${({ compact }) =>
    compact ? componentSize.small : componentSize.medium};
  color: ${({ theme }) => theme.color.text01()};

  background-color: ${({ variant, theme }) =>
    variant === 'filled' || variant === 'framed'
      ? theme.color.background02()
      : 'transparent'};

  padding: 2px;
  border: 0 solid transparent;
  border-radius: ${shape.radius.medium};

  ${({ variant, theme }) =>
    variant === 'framed'
      ? css`
          padding: 1px;
          border: 1px solid ${theme.color.element01()};
        `
      : undefined}

  font-family: ${({ theme }) => theme.font.family};
  font-size: ${({ theme }) => theme.font.size.regular};
  line-height: ${({ theme }) => theme.font.lineHeight.large};
  text-align: left;
  cursor: pointer;

  ${SelectInsideContainer} {
    padding: ${({ compact }) =>
      compact
        ? `0 ${spacing.small} 0 ${spacing.medium}`
        : `0 ${spacing.medium}`};
  }

  > div > span > svg {
    width: 100%;
    height: 100%;
    cursor: pointer;
    background-color: transparent;
    fill: ${({ theme }) => theme.color.element01()};
  }

  &:hover {
    background-color: ${({ variant, theme }) =>
      variant === 'filled' || variant === 'framed'
        ? theme.color.background01()
        : theme.color.background02()};

    ${({ variant, theme }) =>
      variant === 'framed'
        ? css`
            padding: 0;
            border: 2px solid ${theme.color.element01()};
          `
        : undefined}
  }

  &:focus {
    outline: none;

    ${({ openedFocus, visibleFocus, variant, theme }) =>
      openedFocus
        ? css`
            background-color: ${theme.color.background01()};
            border: none;
            padding: 2px;
          `
        : visibleFocus
        ? css`
            background-color: ${variant === 'filled' || variant === 'framed'
              ? theme.color.background01()
              : 'transparent'};
            border: 2px solid ${theme.color.textPrimary()};
            padding: 0;
          `
        : undefined}
  }

  &:active {
    background-color: ${({ theme }) => theme.color.background01()};
    border: none;
    padding: 2px;
  }

  ${({ disabled }) =>
    disabled
      ? css`
          opacity: ${opacity[48]};
          pointer-events: none;
        `
      : undefined}

  ${({ theme, hasError }) =>
    hasError
      ? css`
          &,
          &:hover,
          &:focus {
            background-color: ${theme.color.backgroundError()};
            border-color: ${theme.color.elementError()};
          }
        `
      : undefined};
`

type SelectVariant = 'filled' | 'transparent' | 'framed'

export enum SelectKeys {
  Space = ' ',
  ArrowUp = 'ArrowUp',
  ArrowDown = 'ArrowDown',
  Enter = 'Enter',
  Escape = 'Escape',
  // 'Esc' need for Edge and IE 11
  Esc = 'Esc',
}

export interface IBaseOption<V extends string = string> {
  readonly value: V
  readonly component: ReactNode
  readonly disabled?: boolean
}

export type SelectHandler<V extends string = string> = (value: V) => void

export interface IBaseSelectProps<V extends string = string>
  extends Omit<
    IPopOverProps,
    'anchorEl' | 'value' | 'onChange' | 'onBlur' | 'onKeyDown'
  > {
  /**
   * Selects an item in the dropdown menu.
   * Must pre-exist in the dropdown menu and written in lowercase.
   * Otherwise no value is selected.
   */
  readonly value: V
  /**
   * Used to create an array of selectable options.
   */
  readonly options: ReadonlyArray<IBaseOption<V>>
  /**
   * Executes a JavaScript when a user changes the selected option of an element.
   */
  readonly onChange?: (value: V) => void
  /**
   * Executes a JavaScript when a user leaves an input field.
   */
  readonly onBlur?: (value: boolean) => void
  /**
   * Used to determine the width of a dropdown menu.
   */
  readonly width?: 'small' | 'medium' | 'large' | 'full'
  /**
   * Override theme's default setting for `compact` if set.
   */
  readonly compact?: boolean
  /**
   * Override theme's default setting for `selectMarker` if set.
   * Used to choose between `background` or `check`.
   */
  readonly selectMarker?: ISelectMarker
  /**
   * Used to choose between `filled` or `transparent` or`framed` variant.
   * Default: `filled`
   */
  readonly variant?: SelectVariant
  /**
   * Placeholder text when no value has been selected.
   */
  readonly component: ReactNode
  /**
   * If `true`, select will be disabled.
   */
  readonly disabled?: boolean
  // TODO: ideally this should have an 'auto' setting
  // that is the default, but that requires computing
  // available space below it and the size of the dropdown.
  /**
   * Used to determine which direction the menu pops out in.
   * Default: `auto`
   */
  readonly direction?: DirectionType
  /**
   * Aligns the menu either left or right.
   * Default: `left`
   */
  readonly align?: 'left' | 'right'
  /**
   * Displays an error if something is at fault.
   */
  readonly error?: string
  /**
   * Text that is shown when all available options are selected
   * in the dropdown list
   */
  readonly noOptionsLabel?: string
}

export function BaseSelect<V extends string = string>({
  value,
  options,
  onChange,
  onBlur,
  width = 'full',
  compact: compactFromProps,
  selectMarker: selectMarkerFromProps,
  variant = 'filled',
  component,
  disabled = false,
  direction = 'auto',
  align = 'left',
  error = '',
  noOptionsLabel,
  ...props
}: IBaseSelectProps<V>): JSX.Element {
  const {
    compact: compactFromTheme,
    selectMarker: selectMarkerFromTheme,
  } = useTheme()
  const compact = compactFromProps ?? compactFromTheme
  const selectMarker = selectMarkerFromProps ?? selectMarkerFromTheme

  const [isOpen, openPopover, closePopover, toggleOpen] = useBoolean(false)
  const [isKeyboard, setKeyboardOn, setKeyboardOff] = useBoolean(true)

  const [popupAnchorEl, setPopupAnchorEl] = useState<HTMLDivElement | null>(
    null
  )

  const optionMap = useMemo(() => {
    return new Map(
      options.map<[V, IBaseOption<V> & { readonly index: number }]>(
        (option, index) => {
          return [option.value, { ...option, index }]
        }
      )
    )
  }, [options])

  const valueOption = optionMap.get(value)
  const valueIndex = valueOption !== undefined ? valueOption.index : null

  const optionHandlers = useMemo(() => {
    return options.map(option => {
      return (event: React.SyntheticEvent) => {
        event.stopPropagation()

        if (option.disabled === true) {
          return
        }
        if (option.value !== value) {
          onChange?.(option.value)
        }

        closePopover()
      }
    })
  }, [options, value, closePopover, onChange])

  const arrowIndex = useRef<number | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const itemRefs = useRef<Map<number, HTMLLIElement>>(new Map())

  // In order to change selection with the keyboard,
  // we relay purely on DOM references, otherwise the
  // performance is horrible (freeze when keeping keys pressed).
  // For this, we use a 'arrow-select' class which is set on
  // the currently "selected" item (when using arrow keys).
  const moveArrowSelectIndex = useCallback(
    (fromIndex: number | null, toIndex: number | null) => {
      const itemRef =
        fromIndex !== null ? itemRefs.current.get(fromIndex) : undefined
      const nextItemRef =
        toIndex !== null ? itemRefs.current.get(toIndex) : undefined

      if (itemRef !== undefined) {
        itemRef.classList.remove('arrow-select')
      }

      if (nextItemRef !== undefined) {
        nextItemRef.classList.add('arrow-select')
        scrollIntoView(nextItemRef)
      }

      arrowIndex.current = toIndex
    },
    []
  )

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const { key } = event

      if (!(key in SelectKeys)) {
        return
      }

      if (key === SelectKeys.Escape || key === SelectKeys.Esc) {
        if (isOpen) {
          event.preventDefault()
          closePopover()
          setKeyboardOn()
        }

        return
      }

      event.preventDefault()

      if (!isOpen) {
        arrowIndex.current = valueIndex
        openPopover()
        return
      }

      switch (key) {
        case SelectKeys.ArrowDown:
        case SelectKeys.ArrowUp: {
          const findIndex =
            key === SelectKeys.ArrowUp ? findPrevIndex : findNextIndex
          const nextIndex = findIndex(arrowIndex.current, options)

          moveArrowSelectIndex(arrowIndex.current, nextIndex)
          break
        }

        case SelectKeys.Enter: {
          if (arrowIndex.current === null) {
            closePopover()
            setKeyboardOn()
            break
          }

          optionHandlers[arrowIndex.current](event)
          break
        }
      }
    },
    [
      isOpen,
      valueIndex,
      moveArrowSelectIndex,
      options,
      optionHandlers,
      closePopover,
      openPopover,
      setKeyboardOn,
    ]
  )

  // Scroll to the selected item on open.
  // useLayoutEffect is used here instead of useEffect so that
  // the scroll adjustment is synchronous (otherwise you see
  // it hop to the correct position)
  useLayoutEffect(() => {
    if (!isOpen) {
      return undefined
    }

    if (listRef.current === null) {
      return undefined
    }

    const selectedItem =
      valueIndex !== null ? itemRefs.current.get(valueIndex) : undefined
    if (selectedItem !== undefined) {
      scrollIntoView(selectedItem)
    }
  }, [isOpen, listRef, itemRefs, valueIndex])

  const handleBlur = useCallback(() => {
    if (onBlur !== undefined) {
      onBlur(true)
    }
    setKeyboardOn()
    closePopover()
  }, [onBlur, closePopover, setKeyboardOn])

  return (
    <SelectContainer width={width} ref={setPopupAnchorEl} {...props}>
      <SelectInput
        onClick={toggleOpen}
        compact={compact}
        variant={variant}
        onKeyDown={handleKeyDown}
        onPointerDown={setKeyboardOff}
        onBlur={handleBlur}
        openedFocus={isOpen}
        visibleFocus={isKeyboard}
        hasError={error.length > 0}
        role="button"
        tabIndex={0}
        disabled={disabled}
      >
        <SelectInsideContainer>
          {component}
          <Icon icon={isOpen ? ArrowUpIcon : ArrowDownIcon} />
        </SelectInsideContainer>
      </SelectInput>
      <SelectPopover
        anchorEl={popupAnchorEl}
        onScroll={closePopover}
        compact={compact}
        selectMarker={selectMarker}
        direction={direction}
        align={align}
        onKeyDown={handleKeyDown}
        isOpen={isOpen}
        valueIndex={valueIndex}
        options={options}
        optionHandlers={optionHandlers}
        itemRefs={itemRefs}
        listRef={listRef}
        noOptionsLabel={noOptionsLabel}
      />
    </SelectContainer>
  )
}