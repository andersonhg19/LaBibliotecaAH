import React from 'react'

import { Text, TouchableOpacity } from 'react-native'

import { act, fireEvent, render } from '@testing-library/react-native'

// Use the REAL implementation (jest.setup.js globally stubs useToast).
const { ToastProvider, useToast } = jest.requireActual('../ToastContext')

const Consumer: React.FC = () => {
  const { toasts, showToast, hideToast } = useToast()
  return (
    <>
      <Text testID="count">{String(toasts.length)}</Text>
      <TouchableOpacity testID="add" onPress={() => showToast('success', 'Ok', 'msg')}>
        <Text>add</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="addError" onPress={() => showToast('error', 'Err')}>
        <Text>addError</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="addCustom" onPress={() => showToast('info', 'Custom', undefined, 1000)}>
        <Text>addCustom</Text>
      </TouchableOpacity>
      {toasts[0] && (
        <TouchableOpacity testID="hide" onPress={() => hideToast(toasts[0].id)}>
          <Text>hide</Text>
        </TouchableOpacity>
      )}
    </>
  )
}

describe('ToastContext', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  const renderConsumer = () =>
    render(
      <ToastProvider>
        <Consumer />
      </ToastProvider>,
    )

  it('starts with no toasts', () => {
    const { getByTestId } = renderConsumer()
    expect(getByTestId('count').props.children).toBe('0')
  })

  it('shows a toast and auto-hides it after the default duration', () => {
    const { getByTestId } = renderConsumer()
    fireEvent.press(getByTestId('add'))
    expect(getByTestId('count').props.children).toBe('1')
    act(() => {
      jest.advanceTimersByTime(3000)
    })
    expect(getByTestId('count').props.children).toBe('0')
  })

  it('uses a longer default duration for error toasts', () => {
    const { getByTestId } = renderConsumer()
    fireEvent.press(getByTestId('addError'))
    expect(getByTestId('count').props.children).toBe('1')
    act(() => {
      jest.advanceTimersByTime(3000)
    })
    expect(getByTestId('count').props.children).toBe('1') // still visible (5000ms)
    act(() => {
      jest.advanceTimersByTime(2000)
    })
    expect(getByTestId('count').props.children).toBe('0')
  })

  it('respects a custom duration', () => {
    const { getByTestId } = renderConsumer()
    fireEvent.press(getByTestId('addCustom'))
    act(() => {
      jest.advanceTimersByTime(1000)
    })
    expect(getByTestId('count').props.children).toBe('0')
  })

  it('hides a toast manually', () => {
    const { getByTestId } = renderConsumer()
    fireEvent.press(getByTestId('add'))
    expect(getByTestId('count').props.children).toBe('1')
    fireEvent.press(getByTestId('hide'))
    expect(getByTestId('count').props.children).toBe('0')
  })

  it('throws when useToast is used outside of a ToastProvider', () => {
    const Orphan: React.FC = () => {
      useToast()
      return null
    }
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Orphan />)).toThrow('useToast must be used within a ToastProvider')
    spy.mockRestore()
  })
})
