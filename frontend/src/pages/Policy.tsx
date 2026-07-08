export function Policy() {
  return (
    <section className="page-policy">
      <div className="policy-header">
        <p className="eyebrow">Patient Information</p>
        <h1>Welcome to JT Clinic!</h1>
        <p className="hero-copy">
          We are committed to providing you with the highest quality healthcare in a caring and
          comfortable environment. This information outlines our policies and procedures to ensure a
          smooth experience for all our patients.
        </p>
      </div>

      <div className="policy-body">

        <div className="policy-section">
          <h2>1. Appointments</h2>

          <h3>Booking an Appointment</h3>
          <p>
            You can book an appointment through our chatbot, by calling our reception, or via our
            website. When booking, please provide your full name, date of birth, contact number, and
            the reason for your visit. This helps us allocate the appropriate time and resources.
          </p>

          <h3>Appointment Types</h3>
          <p>We offer various appointment types, including:</p>
          <ul>
            <li><strong>Initial Consultations:</strong> For new patients or new medical concerns.</li>
            <li><strong>Follow-up Appointments:</strong> For existing conditions or ongoing care.</li>
            <li><strong>Urgent Care Appointments:</strong> For acute issues requiring prompt attention (subject to availability).</li>
            <li><strong>Telehealth Consultations:</strong> Available for select services; please inquire about eligibility.</li>
          </ul>

          <h3>Changing an Appointment</h3>
          <p>
            If you need to change your appointment, please notify us at least 24 hours in advance.
            This allows us to offer the slot to another patient who may need it. You can change your
            appointment through the chatbot, by calling us, or through our online patient portal.
          </p>

          <h3>Cancelling an Appointment</h3>
          <p>
            If you need to cancel, please provide at least 24 hours' notice. Cancellations made with
            less than 24 hours' notice, or missed appointments without prior notification, may incur
            a cancellation fee. We understand emergencies happen; please contact us as soon as
            possible if you cannot make your appointment due to unforeseen circumstances. You can
            cancel via the chatbot, phone, or patient portal.
          </p>

          <h3>Late Arrivals</h3>
          <p>
            We strive to keep our appointments on schedule. If you anticipate being more than 10
            minutes late, please call us. Depending on the schedule, we may need to reschedule your
            appointment or you may experience a longer wait time.
          </p>
        </div>

        <div className="policy-section">
          <h2>2. Clinic Information</h2>

          <h3>Contact Details</h3>
          <div className="policy-info-grid">
            <div className="policy-info-card">
              <span className="policy-info-label">Phone</span>
              <span className="policy-info-value">+44 7881277367</span>
            </div>
            <div className="policy-info-card">
              <span className="policy-info-label">Address</span>
              <span className="policy-info-value">143 Clinic Street S5</span>
            </div>
            <div className="policy-info-card">
              <span className="policy-info-label">Website</span>
              <span className="policy-info-value">www.JTClinic.com</span>
            </div>
            <div className="policy-info-card">
              <span className="policy-info-label">Email</span>
              <span className="policy-info-value">enquiries@jtclinic.com</span>
            </div>
          </div>

          <h3>Opening Hours</h3>
          <div className="policy-hours">
            <div className="policy-hours-row">
              <span>Monday – Friday</span>
              <span>10 AM – 9 PM</span>
            </div>
            <div className="policy-hours-row">
              <span>Saturday</span>
              <span>10 AM – 7 PM (select services only)</span>
            </div>
            <div className="policy-hours-row policy-hours-closed">
              <span>Sunday</span>
              <span>Closed</span>
            </div>
            <div className="policy-hours-row policy-hours-closed">
              <span>Public Holidays</span>
              <span>Closed (unless otherwise notified)</span>
            </div>
          </div>

          <h3>Services Offered</h3>
          <div className="policy-services">
            {['General Medical Consultations', 'Preventative Health Screening', 'Physiotherapy', 'Dental', 'Mental Health Support'].map((s) => (
              <span key={s} className="policy-service-tag">{s}</span>
            ))}
          </div>

          <h3>Our Team</h3>
          <p>
            Our dedicated team includes General Practitioners, Specialists, Nurses, and Reception
            Staff. All our staff are highly qualified and committed to your health journey.
          </p>
        </div>

        <div className="policy-section">
          <h2>3. Patient Care & Rights</h2>

          <h3>Confidentiality</h3>
          <p>
            Your medical information is strictly confidential. We adhere to all privacy regulations
            (e.g., HIPAA in the US, GDPR in Europe) to protect your personal health information.
            Information will only be shared with your consent or as required by law.
          </p>

          <h3>Patient Rights</h3>
          <p>As a patient at JT Clinic, you have the right to:</p>
          <ul>
            <li>Receive clear and understandable information about your health.</li>
            <li>Participate in decisions about your care.</li>
            <li>Have your privacy respected.</li>
            <li>Receive respectful and compassionate care.</li>
            <li>Provide feedback or make a complaint without fear of reprisal.</li>
          </ul>

          <h3>Feedback and Complaints</h3>
          <p>
            We value your feedback. If you have any suggestions, concerns, or complaints, please do
            not hesitate to speak with our practice manager or submit your feedback through our
            website.
          </p>
        </div>

        <div className="policy-section">
          <h2>4. Payments & Billing</h2>

          <h3>Fees</h3>
          <p>
            Fees for services vary depending on the type of consultation and any procedures
            performed. We will inform you of the estimated costs upfront where possible. Payment is
            expected at the time of service.
          </p>

          <h3>Payment Methods</h3>
          <p>
            We accept cash, credit/debit cards — Visa, MasterCard, Amex — and contactless payments.
          </p>

          <h3>Insurance</h3>
          <p>
            We are a private billing clinic. Please check with your insurance provider prior to your
            appointment to understand your coverage and any out-of-pocket expenses.
          </p>
        </div>

        <div className="policy-section">
          <h2>5. Prescriptions & Referrals</h2>

          <h3>Prescription Renewals</h3>
          <p>
            For prescription renewals, please book an appointment with your doctor. We generally do
            not offer prescription renewals without a consultation to ensure appropriate medical
            oversight.
          </p>

          <h3>Referrals</h3>
          <p>
            If you require a referral to a specialist, please discuss this with your doctor during
            your consultation. Referrals cannot be backdated.
          </p>
        </div>

        <div className="policy-section policy-emergency">
          <h2>6. Emergency Information</h2>
          <p>
            Our clinic is not equipped for medical emergencies. In case of a life-threatening
            emergency, please <strong>call 999</strong> or go to the nearest emergency department.
          </p>
        </div>

      </div>
    </section>
  )
}
