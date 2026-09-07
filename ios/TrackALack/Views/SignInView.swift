import SwiftUI
import UIKit

struct SignInView: View {
    @EnvironmentObject var store: Store

    @State private var creating = false
    @State private var email = ""
    @State private var password = ""
    @State private var name = ""
    @State private var message: String?
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Track-a-Lack")
                .font(Theme.heading(17))
                .padding(.horizontal, 20)
                .padding(.vertical, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.bg)
                .overlay(alignment: .bottom) { Rule() }

            VStack(alignment: .leading, spacing: 14) {
                Text(creating ? "Create an account" : "Sign in").font(Theme.heading(25))
                Text("Modules, entries and connections all hang off this login — it is also how someone adds you as a connection.")
                    .font(Theme.font(13)).opacity(0.75)

                if let message {
                    Text(message)
                        .font(Theme.font(12.5))
                        .foregroundStyle(Theme.accent700)
                        .padding(10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.accent100)
                        .overlay(alignment: .leading) { Rectangle().fill(Theme.accent).frame(width: 4) }
                }

                if creating {
                    field(title: "Display name", text: $name)
                }
                field(title: "Email", text: $email, keyboard: .emailAddress)
                field(title: "Password", text: $password, secure: true)

                LogControl(label: creating ? "Create account" : "Sign in", busy: busy) {
                    busy = true
                    Task {
                        message = creating
                            ? await store.signUp(
                                email: email,
                                password: password,
                                displayName: name.isEmpty ? String(email.prefix(while: { $0 != "@" })) : name
                              )
                            : await store.signIn(email: email, password: password)
                        busy = false
                    }
                }

                Button(creating ? "I already have an account" : "Create an account instead") {
                    creating.toggle()
                    message = nil
                }
                .font(Theme.font(14, .heavy))
                .foregroundStyle(Theme.accent)
            }
            .padding(20)

            Spacer()
        }
        .background(Theme.warm)
    }

    private func field(
        title: String,
        text: Binding<String>,
        keyboard: UIKeyboardType = .default,
        secure: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Text(title).font(Theme.font(12)).opacity(0.7)
            Group {
                if secure {
                    SecureField("", text: text)
                } else {
                    TextField("", text: text)
                        .keyboardType(keyboard)
                        .textInputAutocapitalization(.never)
                }
            }
            .textFieldStyle(.plain)
            .font(Theme.font(15))
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            .background(Theme.surface)
            .overlay(Rectangle().stroke(Theme.divider, lineWidth: 1))
        }
    }
}
