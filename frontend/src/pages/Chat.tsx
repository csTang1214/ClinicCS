import { useState, useRef, useEffect } from 'react'
import { useChat } from '../services/queries'
import api, { endpoints } from '../services/api'
import { DatePicker } from '../components/DatePicker'
import { ServicePicker } from '../components/ServicePicker'
import { SlotPicker } from '../components/SlotPicker'
import { BookingConfirmation } from '../components/BookingConfirmation'
import { CancelConfirmation } from '../components/CancelConfirmation'

interface Message {
  id: string
  text: string
  sender: 'user' | 'bot'
  timestamp: Date
}

interface ActiveAction {
  type: string
  data: Record<string, any>
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hello! I'm your clinic assistant. How can I help you today?",
      sender: 'bot',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [sessionId, setSessionId] = useState<string | undefined>(undefined)
  const [activeAction, setActiveAction] = useState<ActiveAction | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { mutateAsync: sendChatMessage } = useChat()

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeAction])

  const handleNewChat = async () => {
    if (sessionId) {
      try { await api.post(endpoints.clearSession, { sessionId }) } catch { /* best-effort */ }
    }
    setSessionId(undefined)
    setActiveAction(null)
    setMessages([
      {
        id: Date.now().toString(),
        text: "Hello! I'm your clinic assistant. How can I help you today?",
        sender: 'bot',
        timestamp: new Date(),
      },
    ])
  }

  // Shared send logic used by both the form and action components
  const sendMessage = async (text: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date(),
    }
    setMessages(prev => [...prev, userMessage])
    setActiveAction(null)
    setIsLoading(true)

    try {
      const data = await sendChatMessage({ message: text, sessionId })
      setSessionId(data.sessionId)

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: data.response,
        sender: 'bot',
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, botMessage])

      if (data.action) {
        setActiveAction({ type: data.action, data: data.actionData ?? {} })
      }
    } catch (error) {
      console.error('Chat error:', error)
      setMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          text: 'Sorry, something went wrong. Please try again.',
          sender: 'bot',
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    const text = input
    setInput('')
    await sendMessage(text)
  }

  const handleSlotSelect = (time: string) => sendMessage(time)
  const handleConfirm  = () => sendMessage('confirm')
  const handleCancelAction = () => sendMessage('no')

  const isInputDisabled = isLoading || !!activeAction

  return (
    <section className="page-chat">
      <div className="chat-container">
        <div className="chat-header">
          <h2>Clinic Assistant Chat</h2>
          <p>Ask me anything about your appointments, medical records, or clinic services</p>
          <button onClick={handleNewChat} className="new-chat-btn" type="button">New Chat</button>
        </div>

        <div className="chat-messages">
          {messages.map(message => (
            <div key={message.id} className={`message message-${message.sender}`}>
              <div className="message-bubble">
                <p>{message.text}</p>
                <span className="message-time">
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="message message-bot">
              <div className="message-bubble">
                <div className="typing-indicator">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          {activeAction?.type === 'show_date_picker' && (
            <DatePicker onSelect={handleSlotSelect} />
          )}

          {activeAction?.type === 'show_service_picker' && (
            <ServicePicker
              services={activeAction.data.services ?? []}
              onSelect={handleSlotSelect}
            />
          )}

          {activeAction?.type === 'show_slot_picker' && (
            <SlotPicker
              date={activeAction.data.date}
              availableSlots={activeAction.data.available ?? []}
              occupiedSlots={activeAction.data.occupied ?? []}
              service={activeAction.data.service}
              onSelect={handleSlotSelect}
            />
          )}

          {(activeAction?.type === 'show_booking_confirmation' || activeAction?.type === 'show_reschedule_confirmation') && (
            <BookingConfirmation
              type={activeAction.type === 'show_reschedule_confirmation' ? 'reschedule' : 'booking'}
              details={activeAction.data.bookingDetails ?? {}}
              onConfirm={handleConfirm}
              onCancel={handleCancelAction}
            />
          )}

          {activeAction?.type === 'show_cancel_confirmation' && (
            <CancelConfirmation
              details={activeAction.data.appointmentDetails}
              onConfirm={handleConfirm}
              onCancel={handleCancelAction}
            />
          )}

          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSendMessage} className="chat-input-form">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={activeAction ? 'Please use the option above…' : 'Type your message here…'}
            disabled={isInputDisabled}
            className="chat-input"
          />
          <button
            type="submit"
            disabled={isInputDisabled || !input.trim()}
            className="chat-send-btn"
          >
            Send
          </button>
        </form>
      </div>
    </section>
  )
}
